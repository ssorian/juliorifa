import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { listOwnProducts } from './purchase-products'
import type { Transaction } from '../repository'
import { expireReservations, lockRaffle } from '../repository'

test('own product list keeps archived titles, scopes owner and allowlists verified attached images', async () => {
  const pg = new PGlite()
  try {
    for (const name of readdirSync('drizzle').filter(n => /^\d{4}.*\.sql$/.test(n)).sort())
      await pg.exec(readFileSync(`drizzle/${name}`, 'utf8'))
    const database = drizzle(pg, { schema })
    await database.insert(schema.user).values({ id: 'u', name: 'Private name', email: 'u@example.test', phone: '+525555555555' })
    const raffleId = '11111111-1111-4111-8111-111111111111'
    const id = '22222222-2222-4222-8222-222222222222'
    const assetId = '33333333-3333-4333-8333-333333333333'
    await database.insert(schema.raffles).values({ id: raffleId, title: 'Producto real', description: '', ticketCount: 10, priceCents: 100, status: 'archived', salesDeadline: new Date(100), images: [{ key: `images/${assetId}`, alt: 'Producto' }] })
    await database.insert(schema.purchases).values({ id, raffleId, userId: 'u', idempotencyKey: 'a'.repeat(32), payloadDigest: 'digest', status: 'awaiting_proof', feeBps: 0, priceCents: 100, subtotalCents: 200, feeCents: 0, totalCents: 200, expiresAt: new Date(100) })
    await database.insert(schema.orderTickets).values([{ orderId: id, ticketNumber: 0 }, { orderId: id, ticketNumber: 2 }])
    await database.insert(schema.occupancy).values([{ raffleId, orderId: id, ticketNumber: 0, state: 'reserved' }, { raffleId, orderId: id, ticketNumber: 2, state: 'reserved' }])
    await database.insert(schema.mediaAssets).values({ id: assetId, key: `images/${assetId}`, kind: 'image', ownerId: 'u', raffleId, status: 'verified', verifiedAt: new Date(0), mime: 'image/png', sizeBytes: 10, digest: 'digest' })
    const reader = database as unknown as Pick<Transaction, 'select'>
    const archived = await listOwnProducts(reader, 'u', 0, 20)
    assert.equal(archived[0].raffleTitle, 'Producto real')
    assert.equal(archived[0].raffleImageUrl, null)
    assert.deepEqual(archived[0].tickets, [0, 2])
    for (const key of ['customer', 'userId', 'proofKey', 'ownerId', 'proofVerified', 'proofMime']) assert.equal(key in archived[0], false)
    assert.deepEqual(await listOwnProducts(reader, 'other', 0, 20), [])
    assert.deepEqual(await listOwnProducts(reader, 'u', 20, 20), [])
    await database.update(schema.raffles).set({ status: 'closed' }).where(eq(schema.raffles.id, raffleId))
    assert.equal((await listOwnProducts(reader, 'u', 0, 20))[0].raffleImageUrl, `/api/media/images/${assetId}`)
    await database.update(schema.mediaAssets).set({ status: 'pending' }).where(eq(schema.mediaAssets.id, assetId))
    assert.equal((await listOwnProducts(reader, 'u', 0, 20))[0].raffleImageUrl, null)
    await database.update(schema.mediaAssets).set({ status: 'verified' }).where(eq(schema.mediaAssets.id, assetId))
    await database.update(schema.raffles).set({ images: [] }).where(eq(schema.raffles.id, raffleId))
    assert.equal((await listOwnProducts(reader, 'u', 0, 20))[0].raffleImageUrl, null)
    await database.transaction(async tx => {
      await lockRaffle(tx as unknown as Transaction, raffleId)
      assert.equal(await expireReservations(tx as unknown as Transaction, [raffleId], new Date(200)), 1)
    })
    const expired = (await listOwnProducts(reader, 'u', 0, 20))[0]
    assert.equal(expired.status, 'expired')
    assert.deepEqual(expired.tickets, [0, 2])
    assert.equal((await database.select().from(schema.occupancy)).length, 0)
    assert.equal((await database.select().from(schema.purchaseEvents))[0].type, 'expired')
  } finally { await pg.close() }
})
