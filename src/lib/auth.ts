import '@tanstack/react-start/server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuthMiddleware, APIError } from 'better-auth/api'
import { magicLink } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db'
import { authConfig } from '../config/auth'
import { sendEmail } from './email/service'
import { completionPath, initialRole } from '../modules/auth/lib/policy'

export const auth = betterAuth({
  baseURL: authConfig.baseURL,
  secret: authConfig.secret,
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: false },
  rateLimit: { enabled: true, storage: 'memory' },
  session: { cookieCache: { enabled: false } },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'client', input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, role: initialRole(user) },
        }),
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Even direct calls to the original API cannot choose an arbitrary callback.
      if (ctx.path === '/sign-in/magic-link' && ctx.body) {
        let checkout: unknown
        try {
          checkout = new URL(
            ctx.body.callbackURL || '',
            'https://local.invalid',
          ).searchParams.get('checkout')
        } catch {
          /* fallback */
        }
        ctx.body.callbackURL = completionPath(checkout)
        ctx.body.newUserCallbackURL = ctx.body.callbackURL
        ctx.body.errorCallbackURL = '/login?error=link'
      }
      if (ctx.path === '/magic-link/verify' && ctx.query) {
        let checkout: unknown
        try {
          checkout = new URL(
            ctx.query.callbackURL || '',
            'https://local.invalid',
          ).searchParams.get('checkout')
        } catch {
          /* fallback */
        }
        ctx.query.callbackURL = completionPath(checkout)
        ctx.query.newUserCallbackURL = ctx.query.callbackURL
        ctx.query.errorCallbackURL = '/login?error=link'
      }
    }),
  },
  plugins: [
    magicLink({
      expiresIn: 300,
      storeToken: 'hashed',
      rateLimit: { max: 5, window: 60 },
      async sendMagicLink({ email, url }) {
        try {
          await sendEmail({
            to: email,
            subject: 'Tu acceso a Nova Rifas',
            text: `Abre este enlace para acceder. Caduca en 5 minutos y solo puede usarse una vez:\n${url}\nSi no lo solicitaste, ignóralo.`,
          })
        } catch {
          throw new APIError('SERVICE_UNAVAILABLE', {
            message: 'No pudimos enviar el enlace. Intenta más tarde.',
          })
        }
      },
    }),
    tanstackStartCookies(),
  ],
})
