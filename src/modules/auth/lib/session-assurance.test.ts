import test from 'node:test'
import assert from 'node:assert/strict'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { createOTP } from '@better-auth/utils/otp'
import { base32 } from '@better-auth/utils/base32'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { testDatabase } from '../../purchases/db/testing'
import * as schema from '../../../db/schema'
import { authRateLimit, passwordSettings } from './auth-settings'
import { adminMfaPlugins, readMfaAccess } from './admin-mfa'
import { assertBusinessAccess } from './business-access'
import { phoneField, validateRegistrationPhone } from './registration'
import { initialRole } from './policy'

const origin = 'http://localhost:3212'
const password = 'isolated-fixture-password'

test('HTTP native TOTP, old/promotion sessions, fresh gate and one-use backups', async () => {
  const f = await testDatabase()
  try {
    const auth = betterAuth({ baseURL: origin, secret: 'isolated-assurance-fixture-long-secret-32',
      database: drizzleAdapter(f.database, { provider: 'pg', schema }),
      emailAndPassword: passwordSettings, rateLimit: authRateLimit,
      session: { cookieCache: { enabled: false } }, plugins: [...adminMfaPlugins(), {
        id: 'isolated-admin-probe',
        endpoints: { adminProbe: createAuthEndpoint('/admin-probe', { method: 'POST' }, async ctx => {
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true })
          if (!session) throw APIError.fromStatus('UNAUTHORIZED')
          const access = await readMfaAccess(ctx.context, session.session.token)
          try {
            const actor = assertBusinessAccess(access)
            if (actor.role !== 'admin') throw new Error('Not admin')
          } catch { throw APIError.fromStatus('FORBIDDEN') }
          return ctx.json({ allowed: true })
        }) },
      }],
      user: { additionalFields: { role: { type: 'string', defaultValue: 'client', input: false }, phone: phoneField } },
      databaseHooks: { user: { create: { before: async user => ({ data: { ...user, role: initialRole(user) } }) } } },
      hooks: { before: createAuthMiddleware(async ctx => { validateRegistrationPhone(ctx) }) },
    })
    let nextIP = 50
    const client = () => {
      const cookies = new Map<string, string>()
      const ip = `192.0.2.${nextIP++}`
      const headers = () => new Headers({ 'Content-Type': 'application/json', Origin: origin, 'x-forwarded-for': ip,
        Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') })
      const post = async (path: string, body: object) => {
        const response = await auth.handler(new Request(`${origin}/api/auth/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }))
        for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const at = pair.indexOf('='); cookies.set(pair.slice(0,at), pair.slice(at+1)) }
        return response
      }
      const access = async () => {
        const session = await auth.api.getSession({ headers: headers(), query: { disableCookieCache: true } })
        return session ? readMfaAccess(await auth.$context, session.session.token) : null
      }
      return { post, access, headers }
    }
    // Historical short password and NULL phone are accepted for clients.
    await f.database.insert(schema.account).values({ id: 'legacy-credential', accountId: 'u', userId: 'u', providerId: 'credential', password: await hashPassword('short123') })
    const legacy = client()
    assert.equal((await legacy.post('sign-in/email', { email: 'u@example.invalid', password: 'short123' })).status, 200)
    const legacyAccess = await legacy.access()
    assert.equal(legacyAccess?.assured, false)
    assert.doesNotThrow(() => assertBusinessAccess(legacyAccess))
    await f.database.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, 'u'))
    assert.equal((await legacy.post('admin-probe', {})).status, 403)
    const legacySetupResponse = await legacy.post('two-factor/enable', { password: 'short123' })
    assert.equal(legacySetupResponse.status, 200)
    const legacySetup = await legacySetupResponse.json()
    const legacySecret = new TextDecoder().decode(base32.decode(new URL(legacySetup.totpURI).searchParams.get('secret')!))
    assert.equal((await legacy.post('two-factor/verify-totp', { code: await createOTP(legacySecret).totp() })).status, 200)
    assert.equal((await legacy.post('admin-probe', {})).status, 200)
    const signup = client()
    const credentials = { name: 'Fixture', email: 'assurance@example.invalid', password, phone: '+525512345678', role: 'admin' }
    const created = await signup.post('sign-up/email', credentials)
    assert.equal(created.status, 200)
    const userId = (await created.json()).user.id
    assert.equal((await signup.access())?.role, 'client', 'public role input ignored')
    assert.doesNotThrow(() => assertBusinessAccess({ id: userId, role: 'client', assured: false }))
    const old = client()
    assert.equal((await old.post('sign-in/email', credentials)).status, 200)
    await f.database.update(schema.user).set({ role: 'admin', phone: null }).where(eq(schema.user.id, userId))
    const promoted = await old.access()
    assert.equal(promoted?.role, 'admin')
    assert.equal(promoted?.assured, false)
    assert.equal((await old.post('admin-probe', {})).status, 403)
    assert.throws(() => assertBusinessAccess(promoted), /FORBIDDEN/)
    const enrollment = await signup.post('two-factor/enable', { password })
    assert.equal(enrollment.status, 200)
    const setup = await enrollment.json()
    const secret = new TextDecoder().decode(base32.decode(new URL(setup.totpURI).searchParams.get('secret')!))
    assert.equal((await signup.access())?.enrolled, false)
    const code = await createOTP(secret).totp()
    assert.equal((await signup.post('two-factor/verify-totp', { code, mfaFactorId: 'forged', mfaVerifiedAt: new Date().toISOString() })).status, 200)
    const verified = await signup.access()
    assert.equal(verified?.assured, true, 'only native verified/rotated session gets assurance')
    assert.doesNotThrow(() => assertBusinessAccess(verified))
    assert.equal((await signup.post('admin-probe', {})).status, 200)
    assert.equal((await old.post('admin-probe', {})).status, 403)
    assert.equal((await old.access())?.enrolled, true)
    assert.equal((await old.access())?.assured, false, 'other pre-enrollment session is not upgraded')
    const oldAccess = await old.access()
    assert.throws(() => assertBusinessAccess(oldAccess), /FORBIDDEN/)
    assert.equal((await old.post('two-factor/get-totp-uri', { password })).status, 403)
    assert.equal((await old.post('two-factor/generate-backup-codes', { password })).status, 403)
    assert.equal((await signup.post('two-factor/disable', { password })).status, 403)
    assert.equal((await old.post('two-factor/verify-totp', { code: 'invalid', mfaFactorId: 'forged', mfaVerifiedAt: new Date().toISOString() })).status, 401)
    assert.equal((await old.access())?.assured, false)
    assert.equal((await old.post('two-factor/verify-totp', { code: await createOTP(secret).totp() })).status, 200)
    assert.equal((await old.access())?.assured, true, 'existing session can step up only with native verification')
    const challenge = client()
    const login = await challenge.post('sign-in/email', credentials)
    assert.equal(login.status, 200)
    assert.equal((await login.json()).twoFactorRedirect, true)
    assert.equal(await challenge.access(), null, 'challenge is not an authenticated session')
    assert.equal((await challenge.post('admin-probe', {})).status, 401)
    assert.equal((await challenge.post('two-factor/verify-totp', { code: 'not-valid' })).status, 401)
    assert.equal(await challenge.access(), null)
    assert.equal((await challenge.post('two-factor/verify-totp', { code: await createOTP(secret).totp() })).status, 200)
    assert.equal((await challenge.access())?.assured, true)
    const backup = client()
    await backup.post('sign-in/email', credentials)
    assert.equal((await backup.post('two-factor/verify-backup-code', { code: setup.backupCodes[0] })).status, 200)
    assert.equal((await backup.access())?.assured, true)
    const replay = client()
    await replay.post('sign-in/email', credentials)
    assert.equal((await replay.post('two-factor/verify-backup-code', { code: setup.backupCodes[0] })).status, 401)
    assert.equal(await replay.access(), null)
    const parallelA = client(), parallelB = client()
    await parallelA.post('sign-in/email', credentials)
    await parallelB.post('sign-in/email', credentials)
    const parallel = await Promise.all([parallelA, parallelB].map(c => c.post('two-factor/verify-backup-code', { code: setup.backupCodes[1] })))
    assert.equal(parallel.filter(r => r.status === 200).length, 1, 'one-use native compare-and-swap under interleaving')
    assert.ok(parallel.some(r => [401, 409].includes(r.status)))
    const forged = client()
    await forged.post('sign-in/email', credentials)
    assert.equal((await forged.post('two-factor/verify-backup-code', { code: setup.backupCodes[2], disableSession: true })).status, 403)
    assert.equal((await forged.post('two-factor/verify-totp', { code: await createOTP(secret).totp(), trustDevice: true })).status, 403)
    assert.equal(await forged.access(), null)
    await f.database.update(schema.user).set({ twoFactorEnabled: false }).where(eq(schema.user.id, userId))
    assert.equal((await signup.access())?.assured, false)
    assert.equal((await signup.post('admin-probe', {})).status, 403)
    const disabled = await signup.access()
    assert.throws(() => assertBusinessAccess(disabled), /FORBIDDEN/)
    await f.database.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, userId))
    const native = await auth.api.getSession({ headers: signup.headers(), query: { disableCookieCache: true } })
    const ctx = await auth.$context
    assert.equal((await readMfaAccess({ ...ctx, options: { ...ctx.options, plugins: [] } }, native!.session.token))?.assured, false)
    assert.equal((await signup.post('change-password', { currentPassword: password, newPassword: 'replacement-fixture-password', revokeOtherSessions: true })).status, 200)
    assert.equal((await signup.access())?.assured, false, 'native session rotation cannot inherit assurance')
    assert.equal((await signup.post('admin-probe', {})).status, 403)
    await f.database.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, userId))
    assert.equal((await signup.access())?.assured, false)
  } finally { await f.pg.close() }
})
