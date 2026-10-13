import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../db/schema'
import type { db } from '../../db'
import { createContactService } from './contact-service'

test('business contact SQL: defaults, upsert, public allowlist, fresh gates and disabling', async () => {
  const pg = new PGlite()
  try {
    for (const name of readdirSync(new URL('../../../drizzle/', import.meta.url)).filter((name) => /^\d{4}.*\.sql$/.test(name)).sort()) {
      await pg.exec(readFileSync(new URL(`../../../drizzle/${name}`, import.meta.url), 'utf8'))
    }
    const database = drizzle(pg, { schema })
    await database.insert(schema.user).values({ id: 'admin', name: 'Admin', email: 'admin@fixture.invalid', role: 'admin' })
    let allowed = true
    let gates = 0
    const service = createContactService(database as unknown as typeof db, async () => {
      gates++
      if (!allowed) throw new Error('FORBIDDEN')
      return { id: 'admin' }
    })
    assert.deepEqual(await service.publicContact(), { phone: null, whatsapp: null })
    assert.equal(gates, 0)
    await service.save({ phone: '+52 (55) 1234-5678', whatsapp: '+525587654321' })
    assert.deepEqual(await service.publicContact(), { phone: '+525512345678', whatsapp: '+525587654321' })
    assert.equal(gates, 1)
    assert.deepEqual(await service.adminContact(), await service.publicContact())
    assert.equal(gates, 2)
    await assert.rejects(service.save({ phone: '123', whatsapp: '' }))
    await assert.rejects(service.save({ phone: '', whatsapp: '', updatedBy: 'other' }))
    allowed = false
    await assert.rejects(service.save({ phone: '', whatsapp: '' }), /FORBIDDEN/)
    await assert.rejects(service.adminContact(), /FORBIDDEN/)
    assert.equal((await service.publicContact()).phone, '+525512345678')
    allowed = true
    await service.save({ phone: '', whatsapp: '' })
    assert.deepEqual(await service.publicContact(), { phone: null, whatsapp: null })
    assert.equal((await database.select().from(schema.businessContact)).length, 1)
    await assert.rejects(pg.exec("update business_contact set phone = 'invalid'"))
    await assert.rejects(pg.exec("update business_contact set id = 'other'"))
  } finally {
    await pg.close()
  }
})
