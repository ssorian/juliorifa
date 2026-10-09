import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../db/schema'
import { passwordSettings } from '../lib/auth-settings'
import { PGlite } from '@electric-sql/pglite'
import { verifyPassword } from 'better-auth/crypto'
import { seedClient } from './seed-client'
import type { SeedConnection } from './seed-client'

test('seed creates native client credentials, repeats safely and rejects collisions unchanged', async () => {
  const db = new PGlite()
  try {
    const directory = new URL('../../../../drizzle/', import.meta.url)
    for (const name of (await readdir(directory))
      .filter((migrationName) => /^\d{4}.*\.sql$/.test(migrationName))
      .sort()) {
      await db.exec(await readFile(new URL(name, directory), 'utf8'))
    }
    const repository = {
      transaction: <T>(work: (tx: SeedConnection) => Promise<T>) =>
        db.transaction(work),
    }
    await assert.rejects(
      seedClient({
        transaction: (work) =>
          db.transaction((tx) =>
            work({
              async query(sql, params) {
                if (sql.startsWith('INSERT INTO account'))
                  throw new Error('Fixture insert failure')
                return tx.query(sql, params)
              },
            }),
          ),
      }),
      /Fixture insert failure/,
    )
    assert.equal((await db.query('SELECT * FROM "user"')).rows.length, 0)
    assert.equal(await seedClient(repository), 'created')
    const users = await db.query<Record<string, unknown>>(
      'SELECT * FROM "user"',
    )
    const accounts = await db.query<{
      password: string
      account_id: string
      user_id: string
    }>('SELECT * FROM account')
    assert.equal(users.rows[0].role, 'client')
    assert.equal(users.rows[0].email_verified, false)
    assert.equal(accounts.rows[0].account_id, accounts.rows[0].user_id)
    assert.equal(
      await verifyPassword({
        hash: accounts.rows[0].password,
        password: 'user123',
      }),
      true,
    )
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'isolated-seed-test-secret-at-least-32-characters',
      database: drizzleAdapter(drizzle(db, { schema }), {
        provider: 'pg',
        schema,
      }),
      emailAndPassword: passwordSettings,
      logger: { disabled: true },
    })
    const response = await auth.api.signInEmail({
      body: { email: 'user@gmail.com', password: 'user123' },
      asResponse: true,
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('set-cookie') ?? '', /session_token/)
    assert.equal((await db.query('SELECT * FROM session')).rows.length, 1)
    assert.equal(await seedClient(repository), 'existing')
    assert.deepEqual(
      (await db.query('SELECT * FROM account')).rows,
      accounts.rows,
    )
    for (const change of [
      `UPDATE "user" SET role='admin'`,
      `UPDATE "user" SET role='client', email_verified=true`,
      `UPDATE "user" SET email_verified=false; UPDATE account SET password='different'`,
      `UPDATE account SET provider_id='oauth'`,
      `DELETE FROM account`,
    ]) {
      await db.exec(change)
      const before = await db.query('SELECT * FROM "user"')
      const credentials = await db.query('SELECT * FROM account')
      await assert.rejects(seedClient(repository), /collision/)
      assert.deepEqual(await db.query('SELECT * FROM "user"'), before)
      assert.deepEqual(await db.query('SELECT * FROM account'), credentials)
    }
  } finally {
    await db.close()
  }
})
