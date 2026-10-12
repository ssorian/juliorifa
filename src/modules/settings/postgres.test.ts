import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../db/schema'
import type { db } from '../../db'
import { createSettingsService } from './service'
import { snapshotMethods } from './domain'

test('isolated SQL destinations: admin gates, revocation, stable order and immutable copies', async () => {
  const pg = new PGlite()
  try {
    for (const name of readdirSync(
      new URL('../../../drizzle/', import.meta.url),
    )
      .filter((n) => /^\d{4}.*\.sql$/.test(n))
      .sort())
      await pg.exec(
        readFileSync(
          new URL(`../../../drizzle/${name}`, import.meta.url),
          'utf8',
        ),
      )
    const database = drizzle(pg, { schema })
    await database.insert(schema.user).values({
      id: 'admin',
      name: 'Admin',
      email: 'admin@fixture.invalid',
      role: 'admin',
    })
    let allowed = true
    let requests = 0
    const service = createSettingsService(
      database as unknown as typeof db,
      async () => {
        requests++
        if (!allowed) throw new Error('FORBIDDEN')
        return { id: 'admin' }
      },
    )
    assert.equal(snapshotMethods(await service.list()), null)
    const input = {
      type: 'clabe',
      bank: 'Banco',
      beneficiary: 'Persona',
      number: '012345678901234567',
    }
    const first = await service.add(input)
    const second = await service.add(input)
    assert.notEqual(first.id, second.id)
    assert.match(first.id, /^[a-f0-9-]{36}$/)
    assert.deepEqual(
      (await service.list()).map((row) => row.id),
      [first.id, second.id],
    )
    const original = snapshotMethods(await service.list())!
    await service.edit({ ...input, id: first.id, number: '999999999999999999' })
    await service.activate({ id: second.id, active: false })
    assert.equal(original.length, 2)
    assert.equal(original[0].number, input.number)
    assert.equal(snapshotMethods(await service.list())!.length, 1)
    await service.activate({ id: first.id, active: false })
    assert.deepEqual(snapshotMethods(await service.list()), [])
    await service.activate({ id: second.id, active: true })
    assert.equal(snapshotMethods(await service.list())![0].id, second.id)
    await assert.rejects(service.add({ ...input, id: first.id }))
    await assert.rejects(service.edit({ ...input, id: first.id, active: true }))
    await assert.rejects(service.add({ ...input, number: 'abc' }))
    allowed = false
    for (const operation of [
      () => service.list(),
      () => service.add(input),
      () => service.edit({ ...input, id: first.id }),
      () => service.activate({ id: first.id, active: true }),
    ])
      await assert.rejects(operation(), /FORBIDDEN/)
    assert.ok(requests >= 18)
  } finally {
    await pg.close()
  }
})
