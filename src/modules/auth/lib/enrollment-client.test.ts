import test from 'node:test'
import assert from 'node:assert/strict'
import { betterAuth } from 'better-auth'
import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { testDatabase } from '../../purchases/db/testing'
import * as schema from '../../../db/schema'
import { adminMfaPlugins } from './admin-mfa'
import { authRateLimit, passwordSettings } from './auth-settings'
import { enrollmentDiagnostic } from './enrollment-diagnostic'

test('enrollment diagnostic never returns untrusted values or secret-bearing response fields', () => {
  const body = { code: 'secret-injected-code', message: 'private', totpURI: 'private', backupCodes: ['private'], password: 'private', method: 'totp' }
  assert.deepEqual(enrollmentDiagnostic(200, body), { status: 200, code: 'UNCLASSIFIED', nativeTotpShape: true })
  assert.deepEqual(enrollmentDiagnostic(403, { code: 'MFA_REQUIRED', message: 'private' }), { status: 403, code: 'MFA_REQUIRED', nativeTotpShape: false })
})

test('actual React Auth SDK receives native TOTP enrollment response through HTTP handler', async () => {
  const f = await testDatabase()
  try {
    const origin = 'http://localhost:3212'
    const auth = betterAuth({ baseURL: origin, secret: 'isolated-client-test-secret-at-least-32',
      database: drizzleAdapter(f.database, { provider: 'pg', schema }),
      emailAndPassword: passwordSettings, rateLimit: authRateLimit,
      plugins: [...adminMfaPlugins()], session: { cookieCache: { enabled: false } },
    })
    const cookies = new Map<string, string>()
    const client = createAuthClient({ baseURL: origin,
      disableDefaultFetchPlugins: true, plugins: [twoFactorClient()],
      fetchOptions: { customFetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('Origin', origin)
        headers.set('x-forwarded-for', '192.0.2.201')
        headers.set('Cookie', [...cookies].map(([k,v]) => `${k}=${v}`).join('; '))
        const response = await auth.handler(new Request(input, { ...init, headers }))
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0], at = pair.indexOf('=')
          cookies.set(pair.slice(0, at), pair.slice(at + 1))
        }
        return response
      } },
    })
    const password = 'isolated-client-password'
    const signup = await client.signUp.email({ email: 'sdk@example.invalid', name: 'Fixture', password })
    assert.equal(signup.error, null)
    const invalid = await client.twoFactor.enable({ password: 'wrong' })
    assert.equal(invalid.error?.status, 400)
    const enabled = await client.twoFactor.enable({ password })
    assert.equal(enabled.error, null)
    assert.equal(enabled.data?.method, 'totp')
    assert.equal(enrollmentDiagnostic(200, enabled.data).nativeTotpShape, true)
    assert.equal(typeof (enabled.data?.method === 'totp' && new URL(enabled.data.totpURI).searchParams.get('secret')), 'string')
  } finally { await f.pg.close() }
})
