import test from 'node:test'
import assert from 'node:assert/strict'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { testDatabase } from '../../purchases/db/testing'
import * as schema from '../../../db/schema'
import { authRateLimit, passwordSettings } from './auth-settings'
import { adminMfaPlugins } from './admin-mfa'
import { createAuthMiddleware } from 'better-auth/api'
import { phoneField, validateRegistrationPhone } from './registration'
import { initialRole } from './policy'

const origin = 'http://localhost:3212'
function makeAuth(database: Awaited<ReturnType<typeof testDatabase>>['database']) {
  return betterAuth({
    baseURL: origin,
    secret: 'isolated-security-test-secret-longer-than-32',
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    emailAndPassword: passwordSettings,
    rateLimit: authRateLimit,
    session: { cookieCache: { enabled: false } },
    user: { additionalFields: { role: { type: 'string', defaultValue: 'client', input: false }, phone: phoneField } },
    databaseHooks: { user: { create: { before: async user => ({ data: { ...user, role: initialRole(user) } }) } } },
    hooks: { before: createAuthMiddleware(async ctx => { validateRegistrationPhone(ctx) }) },
    plugins: [...adminMfaPlugins()],
  })
}
function browser(auth: ReturnType<typeof makeAuth>, ip: string) {
  const cookies = new Map<string, string>()
  const headers = () => new Headers({ 'Content-Type': 'application/json', Origin: origin,
    'x-forwarded-for': ip, Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') })
  const post = async (path: string, body: object) => {
    const response = await auth.handler(new Request(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    }))
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const at = pair.indexOf('=')
      cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
    return response
  }
  return Object.assign(post, { headers })
}

test('native rate limiter shares five-attempt budget between independent Auth instances', async () => {
  const f = await testDatabase()
  try {
    const first = browser(makeAuth(f.database), '192.0.2.30')
    const second = browser(makeAuth(f.database), '192.0.2.30')
    for (let i = 0; i < 5; i++) {
      assert.equal((await first('sign-in/email', { email: 'missing@example.invalid', password: 'wrong' })).status, 401)
    }
    assert.equal((await second('sign-in/email', { email: 'missing@example.invalid', password: 'wrong' })).status, 429)
    const persisted = await f.pg.query<{ present: boolean }>("select to_regclass('public.rate_limit') is not null as present")
    assert.equal(persisted.rows[0].present, true, 'native limiter must persist its budget in PostgreSQL')
    const rows = await f.database.select().from(schema.rateLimit)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].count, 5)
    // Signup has its own budget, not a shared five-attempt login/signup bucket.
    for (let i = 0; i < 5; i++) assert.equal((await second('sign-up/email', { name: 'Fixture', email: 'invalid@example.invalid', password: 'too-short' })).status, 400)
    assert.equal((await first('sign-up/email', { name: 'Fixture', email: 'invalid@example.invalid', password: 'too-short' })).status, 429)
    // Expiry is driven by persisted database state; no real minute-long wait.
    await f.pg.query('update rate_limit set last_request = $1', [Date.now() - 61000])
    assert.equal((await second('sign-in/email', { email: 'missing@example.invalid', password: 'wrong' })).status, 401)
  } finally { await f.pg.close() }
})

test('native MFA requires password and exposes TOTP enrollment for authenticated account', async () => {
  const f = await testDatabase()
  try {
    const post = browser(makeAuth(f.database), '192.0.2.31')
    assert.equal((await post('sign-up/email', { name: 'Fixture', email: 'mfa@example.invalid', phone: '+525512345678', password: 'fixture-long-password' })).status, 200)
    assert.equal((await post('two-factor/enable', { password: 'incorrect' })).status, 400)
    const response = await post('two-factor/enable', { password: 'fixture-long-password' })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.method, 'totp')
    assert.match(result.totpURI, /^otpauth:\/\/totp\//)
    assert.equal(result.backupCodes.length, 10)
  } finally { await f.pg.close() }
})
