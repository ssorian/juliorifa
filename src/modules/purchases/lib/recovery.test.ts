import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../../db/schema'
import { findOwnReservationByKey } from '../repository'
import type { Transaction } from '../repository'
import { reservationKeyInput } from '../schemas'

test('recovery strict key-only contract rejects actor/amount override', () => {
  assert.equal(reservationKeyInput.safeParse({ idempotencyKey: 'a'.repeat(32) }).success, true)
  for (const extra of [{ userId: 'other' }, { totalCents: 0 }])
    assert.equal(reservationKeyInput.safeParse({ idempotencyKey: 'a'.repeat(32), ...extra }).success, false)
})
test('SQL read-only owner+key recovery returns original even archived; another actor gets null', async () => {
  const pg = new PGlite()
  try {
    for (const name of readdirSync('drizzle').filter(n => /^\d{4}.*\.sql$/.test(n)).sort())
      await pg.exec(readFileSync(`drizzle/${name}`, 'utf8'))
    const database = drizzle(pg, { schema })
    await database.insert(schema.user).values({ id: 'u', name: 'Client', email: 'u@example.test', role: 'client' })
    const raffleId = '11111111-1111-4111-8111-111111111111'
    const id = '22222222-2222-4222-8222-222222222222'
    const key = 'a'.repeat(32)
    await database.insert(schema.raffles).values({ id: raffleId, title: 'Archived', description: '', ticketCount: 10, priceCents: 100, feeBps: 0, status: 'archived', salesDeadline: new Date(100) })
    await database.insert(schema.purchases).values({ id, raffleId, userId: 'u', idempotencyKey: key, payloadDigest: 'digest', status: 'awaiting_proof', priceCents: 100, feeBps: 0, subtotalCents: 200, feeCents: 0, totalCents: 200, expiresAt: new Date(100), createdAt: new Date(0), paymentSnapshot: { bank: 'B', beneficiary: 'N', account: '123', instructions: 'Pay' } })
    await database.insert(schema.orderTickets).values([{ orderId: id, ticketNumber: 1 }, { orderId: id, ticketNumber: 2 }])
    const reader = database as unknown as Pick<Transaction, 'select'>
    const before = await database.select().from(schema.purchases)
    const owned = await findOwnReservationByKey(reader, 'u', key)
    assert.equal(owned?.id, id)
    assert.deepEqual(owned.tickets, [1, 2])
    assert.equal(owned.totalCents, 200)
    assert.equal(await findOwnReservationByKey(reader, 'other', key), null)
    assert.equal(await findOwnReservationByKey(reader, 'u', 'b'.repeat(32)), null)
    assert.deepEqual(await database.select().from(schema.purchases), before)
    const server = readFileSync('src/modules/purchases/server.ts', 'utf8')
    assert.match(server, /lookupOwnReservationByKey = createServerFn\(\{ method: 'GET' \}\)/)
    const service = readFileSync('src/modules/purchases/services.ts', 'utf8')
    assert.match(service, /const actor = await requireUser\(\)\s+return findOwnReservationByKey\(db, actor.id, idempotencyKey\)/)
  } finally { await pg.close() }
})
