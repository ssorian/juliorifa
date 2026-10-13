import type { AuthContext, BetterAuthPlugin } from '@better-auth/core'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { twoFactor } from 'better-auth/plugins'

type Factor = {
  id: string
  userId: string
  secret: string
  verified: boolean
}
type StoredSession = {
  id: string
  token: string
  userId: string
  expiresAt: Date
  mfaFactorId?: string | null
  mfaVerifiedAt?: Date | null
}
type StoredUser = {
  id: string
  name: string
  role: string
  twoFactorEnabled?: boolean
}
type Reader = {
  adapter: Pick<AuthContext['adapter'], 'findOne'>
  options: Pick<AuthContext['options'], 'plugins'>
}
const verifiedPaths = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
])
const denied = () =>
  APIError.from('FORBIDDEN', {
    code: 'MFA_REQUIRED',
    message: 'Verifica tu segundo factor para continuar.',
  })

/** Always read current DB state. A user-level enabled flag is not session assurance. */
export async function readMfaAccess(ctx: Reader, token: string) {
  const session = await ctx.adapter.findOne<StoredSession>({
    model: 'session',
    where: [{ field: 'token', value: token }],
  })
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null
  const user = await ctx.adapter.findOne<StoredUser>({
    model: 'user',
    where: [{ field: 'id', value: session.userId }],
  })
  if (!user) return null
  const installed =
    ctx.options.plugins?.some(p => p.id === 'two-factor') &&
    ctx.options.plugins?.some(p => p.id === 'admin-session-assurance')
  const factor = installed
    ? await ctx.adapter.findOne<Factor>({
        model: 'twoFactor',
        where: [{ field: 'userId', value: user.id }],
      })
    : null
  const enrolled = !!(
    installed && user.twoFactorEnabled && factor?.verified === true
  )
  const assured = !!(
    enrolled && session.mfaVerifiedAt && session.mfaFactorId === factor?.id
  )
  return { id: user.id, name: user.name, role: user.role, enrolled, assured }
}

export function adminMfaPlugins() {
  // Request-local evidence captured BEFORE the native verifier, never client fields.
  const attempts = new WeakMap<
    object,
    { userId: string; factor: Factor; sessionToken?: string }
  >()
  const assurance = {
    id: 'admin-session-assurance',
    schema: {
      session: {
        fields: {
          mfaFactorId: {
            type: 'string', required: false, input: false, returned: false,
          },
          mfaVerifiedAt: {
            type: 'date', required: false, input: false, returned: false,
          },
        },
      },
    },
    init() {
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                before: async (session) => ({
                  // Native rotation can copy an old session. Never inherit assurance.
                  data: { ...session, mfaFactorId: null, mfaVerifiedAt: null },
                }),
              },
            },
          },
        },
      }
    },
    hooks: {
      before: [{
        matcher: ctx => !!ctx.path?.startsWith('/two-factor/'),
        handler: createAuthMiddleware(async ctx => {
          if (
            ctx.body?.trustDevice || ctx.body?.disableSession ||
            ctx.body?.method === 'otp' ||
            ['/two-factor/send-otp', '/two-factor/verify-otp'].includes(ctx.path)
          ) throw denied()
          const active = await getSessionFromCtx(ctx, { disableCookieCache: true })
          if (verifiedPaths.has(ctx.path)) {
            let userId = active?.user.id
            if (!userId) {
              // Better Auth 1.7.7's signed challenge cookie and native verification store.
              // Reading identifies the subject only; validation/consumption stays native.
              const cookie = ctx.context.createAuthCookie('two_factor')
              const identifier = await ctx.getSignedCookie(
                cookie.name, ctx.context.secret,
              )
              const challenge = identifier
                ? await ctx.context.internalAdapter.findVerificationValue(identifier)
                : null
              if (challenge && challenge.expiresAt > new Date()) {
                userId = challenge.value
              }
            }
            const factor = userId
              ? await ctx.context.adapter.findOne<Factor>({
                  model: 'twoFactor',
                  where: [{ field: 'userId', value: userId }],
                })
              : null
            if (userId && factor) {
              attempts.set(ctx.context, {
                userId, factor, sessionToken: active?.session.token,
              })
            }
            return
          }
          if (!active) throw denied()
          const access = await readMfaAccess(ctx.context, active.session.token)
          if (!access) throw denied()
          // Protect management from password-only sessions retained before enrollment.
          // Administrators cannot turn off their mandatory factor.
          if (ctx.path === '/two-factor/disable' && access.role === 'admin') {
            throw denied()
          }
          if (access.enrolled && !access.assured) throw denied()
        }),
      }],
      after: [{
        matcher: ctx => verifiedPaths.has(ctx.path ?? ''),
        handler: createAuthMiddleware(async ctx => {
          const attempt = attempts.get(ctx.context)
          attempts.delete(ctx.context)
          const result = ctx.context.returned as {
            token?: unknown
            user?: { id?: unknown }
          } | null
          // A successful native verifier returns its authenticated subject and token.
          // Errors (including consumed/replayed backups) never satisfy this shape.
          if (
            !attempt || !result || typeof result.token !== 'string' ||
            result.user?.id !== attempt.userId
          ) return
          const issued = ctx.context.newSession
          const token = issued?.session.token ?? result.token
          if (issued && issued.user.id !== attempt.userId) throw denied()
          if (!issued && attempt.sessionToken !== token) throw denied()
          const factor = await ctx.context.adapter.findOne<Factor>({
            model: 'twoFactor',
            where: [{ field: 'userId', value: attempt.userId }],
          })
          if (
            !factor || factor.verified !== true ||
            factor.id !== attempt.factor.id ||
            factor.secret !== attempt.factor.secret
          ) throw denied()
          const access = await readMfaAccess(ctx.context, token)
          if (!access?.enrolled || access.id !== attempt.userId) throw denied()
          const updated = await ctx.context.adapter.update({
            model: 'session',
            where: [
              { field: 'token', value: token },
              { field: 'userId', value: attempt.userId },
            ],
            update: { mfaFactorId: factor.id, mfaVerifiedAt: new Date() },
          })
          if (!updated) throw denied()
        }),
      }],
    },
  } satisfies BetterAuthPlugin
  return [twoFactor({ issuer: 'Rifas Nova' }), assurance] as const
}
