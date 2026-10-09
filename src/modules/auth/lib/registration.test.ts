import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { testDatabase } from '../../purchases/db/testing'
import { phoneField, validateRegistrationPhone } from './registration'
import { eq } from 'drizzle-orm'
import * as schema from '../../../db/schema'

test('Better Auth direct HTTP signup rejects missing/invalid phone, persists normalized; legacy login allowed', async () => {
  const f = await testDatabase()
  try {
    const auth = betterAuth({
      baseURL: 'http://localhost:3212',
      secret: 'isolated-test-secret-at-least-32-characters',
      database: drizzleAdapter(f.database, { provider: 'pg', schema }),
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
      user: { additionalFields: { phone: phoneField } },
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          validateRegistrationPhone(ctx)
        }),
      },
    })
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`http://localhost:3212/api/auth/${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3212',
          },
          body: JSON.stringify(body),
        }),
      )
    const credentials = {
      name: 'Fixture',
      email: 'new@example.invalid',
      password: 'fixture-password-long',
    }
    for (const phone of [undefined, '', '5512345678', '+52<script>']) {
      const response = await post('sign-up/email', { ...credentials, phone })
      assert.equal(response.status, 400)
    }
    assert.equal(
      (
        await f.database
          .select()
          .from(schema.user)
          .where(eq(schema.user.email, credentials.email))
      ).length,
      0,
    )
    const response = await post('sign-up/email', {
      ...credentials,
      phone: '+52 (55) 1234-5678',
    })
    assert.equal(response.status, 200)
    const [record] = await f.database
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, credentials.email))
    assert.equal(record.phone, '+525512345678')
    await f.database
      .update(schema.user)
      .set({ phone: null })
      .where(eq(schema.user.id, record.id))
    assert.equal(
      (
        await post('sign-in/email', {
          email: credentials.email,
          password: credentials.password,
        })
      ).status,
      200,
    )
    assert.throws(() => validateRegistrationPhone({ path: '/sign-up/email' }))
    assert.doesNotThrow(() =>
      validateRegistrationPhone({ path: '/sign-in/email' }),
    )
    // Guard against accidentally removing authority from the production options.
    const production = readFileSync(
      new URL('../../../lib/auth.ts', import.meta.url),
      'utf8',
    )
    assert.match(production, /phone: phoneField/)
    assert.match(production, /validateRegistrationPhone\(ctx\)/)
  } finally {
    await f.pg.close()
  }
})
