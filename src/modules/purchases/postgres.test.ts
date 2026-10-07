import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync,readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { createWorkflowRepository } from './workflow-repository'
import type { WorkflowDatabase } from './workflow-repository'
import {
  cancelWithRepository,
  finalizeWithRepository,
  reviewWithRepository,
} from './workflow'

const pg = new PGlite()
const database = drizzle(pg, { schema })
before(async () => {
  for (const name of readdirSync(new URL('../../../drizzle/',import.meta.url)).filter(n=>/^\d{4}.*\.sql$/.test(n)).sort())
    await pg.exec(
      readFileSync(
        new URL(`../../../drizzle/${name}`, import.meta.url),
        'utf8',
      ),
    )
  await database.insert(schema.user).values([
    { id: 'u', name: 'Client', email: 'client@example.test', role: 'client' },
    { id: 'a', name: 'Admin', email: 'admin@example.test', role: 'admin' },
  ])
})
after(() => pg.close())
async function fixture() {
  const raffleId = randomUUID(),
    orderId = randomUUID(),
    assetId = randomUUID()
  await database.insert(schema.raffles).values({
    id: raffleId,
    title: 'Test',
    description: '',
    ticketCount: 10,
    priceCents: 100,
    feeBps: 250,
    status: 'active',
    salesDeadline: new Date(10000),
  })
  await database.insert(schema.purchases).values({
    id: orderId,
    raffleId,
    userId: 'u',
    idempotencyKey: randomUUID(),
    payloadDigest: 'digest',
    status: 'awaiting_proof',
    priceCents: 100,
    feeBps: 250,
    subtotalCents: 200,
    feeCents: 5,
    totalCents: 200,
    expiresAt: new Date(100),
    createdAt: new Date(0),
    paymentSnapshot: {
      bank: 'B',
      beneficiary: 'N',
      account: '123',
      instructions: 'Pay',
    },
  })
  await database
    .insert(schema.orderTickets)
    .values([1, 2].map((ticketNumber) => ({ orderId, ticketNumber })))
  await database.insert(schema.occupancy).values(
    [1, 2].map((ticketNumber) => ({
      raffleId,
      orderId,
      ticketNumber,
      state: 'reserved' as const,
    })),
  )
  await database.insert(schema.mediaAssets).values({
    id: assetId,
    key: `proofs/${assetId}`,
    kind: 'proof',
    purchaseId: orderId,
    ownerId: 'u',
    status: 'pending',
    mime: 'application/pdf',
    sizeBytes: 10,
    digest: 'verified-server-bytes',
  })
  // PGlite and node-postgres implement the same Drizzle transaction query surface used here.
  // This structural adapter is not evidence of multi-connection node-postgres concurrency.
  const repo = (actorId = 'u', asset = true) =>
    createWorkflowRepository(database as unknown as WorkflowDatabase, {
      orderId,
      raffleId,
      actorId,
      now: 0,
      ...(asset ? { assetId } : {}),
    })
  const read = async () => ({
    order: (
      await database
        .select()
        .from(schema.purchases)
        .where(eq(schema.purchases.id, orderId))
    ).at(0)!,
    held: await database
      .select()
      .from(schema.occupancy)
      .where(eq(schema.occupancy.orderId, orderId)),
    history: await database
      .select()
      .from(schema.orderTickets)
      .where(eq(schema.orderTickets.orderId, orderId)),
    events: await database
      .select()
      .from(schema.purchaseEvents)
      .where(eq(schema.purchaseEvents.orderId, orderId)),
    outbox: await database
      .select()
      .from(schema.notificationOutbox)
      .where(eq(schema.notificationOutbox.key, orderId)),
  })
  return { orderId, raffleId, assetId, repo, read }
}
test('real PostgreSQL engine: expired cancel commits release and preserves history', async () => {
  const f = await fixture()
  assert.equal(
    (await cancelWithRepository(f.repo(), 'u', 100)).status,
    'expired',
  )
  const result = await f.read()
  assert.equal(result.order.status, 'expired')
  assert.equal(result.held.length, 0)
  assert.equal(result.history.length, 2)
  assert.deepEqual(
    result.events.map((e) => e.type),
    ['expired'],
  )
})
test('real transaction: proof received late cannot roll expiry back', async () => {
  const f = await fixture()
  assert.equal(
    (await finalizeWithRepository(f.repo(), 'u', 100)).status,
    'expired',
  )
  const result = await f.read()
  assert.equal(result.held.length, 0)
  assert.equal(result.order.proofAssetId, null)
  assert.equal(result.history.length, 2)
})
test('real transaction: ownership denial rolls back; timely proof never expires; paid is idempotent', async () => {
  const f = await fixture()
  await assert.rejects(
    finalizeWithRepository(f.repo(), 'other', 99),
    /NOT_FOUND/,
  )
  assert.equal((await f.read()).order.status, 'awaiting_proof')
  await finalizeWithRepository(f.repo(), 'u', 99)
  await reviewWithRepository(
    f.repo('a'),
    'admin',
    'paid',
    'Validated transfer',
    100000,
  )
  await reviewWithRepository(f.repo('a'), 'admin', 'paid', 'Retry', 100001)
  const result = await f.read()
  assert.equal(result.order.status, 'paid')
  assert.deepEqual(
    result.held.map((t) => t.state),
    ['sold', 'sold'],
  )
  assert.equal(result.outbox.length, 1)
  assert.equal(result.outbox[0].event, 'purchase.approved')
  assert.equal(result.events.filter((e) => e.type === 'approved').length, 1)
  assert.equal(result.order.totalCents, 200)
  assert.equal(result.order.feeCents, 5)
})
test('real transaction: reject keeps history/audit and releases tickets with one outbox event', async () => {
  const f = await fixture()
  await finalizeWithRepository(f.repo(), 'u', 99)
  await reviewWithRepository(
    f.repo('a'),
    'admin',
    'rejected',
    'Receipt illegible',
    100000,
  )
  await reviewWithRepository(f.repo('a'), 'admin', 'rejected', 'Retry', 100001)
  const result = await f.read()
  assert.equal(result.held.length, 0)
  assert.equal(result.history.length, 2)
  assert.equal(result.outbox.length, 1)
  assert.equal(result.order.reviewerId, 'a')
  assert.equal(result.events.at(-1)?.reason, 'Receipt illegible')
})
test('real transaction: approve without registered verified proof denied; SQL unique occupancy protects', async () => {
  const f = await fixture()
  await database
    .update(schema.purchases)
    .set({ status: 'reviewing' })
    .where(eq(schema.purchases.id, f.orderId))
  await assert.rejects(
    reviewWithRepository(f.repo('a', false), 'admin', 'paid', 'Verified', 999),
    /VERIFIED_PROOF_REQUIRED/,
  )
  assert.equal((await f.read()).outbox.length, 0)
  await assert.rejects(
    database
      .insert(schema.occupancy)
      .values({ raffleId: f.raffleId, ticketNumber: 1, state: 'blocked' }),
  )
  assert.equal((await f.read()).held.length, 2)
})
test('real transaction: proof key must be generated from asset UUID, not arbitrary pending key', async () => {
  const f = await fixture()
  await database
    .update(schema.mediaAssets)
    .set({ key: 'proofs/../receipt' })
    .where(eq(schema.mediaAssets.id, f.assetId))
  await assert.rejects(
    finalizeWithRepository(f.repo(), 'u', 99),
    /INVALID_ASSET/,
  )
  assert.equal((await f.read()).order.proofAssetId, null)
})

test('real transaction: failed occupancy invariant rolls back proof verification and status', async () => {
  const f = await fixture()
  await database
    .update(schema.occupancy)
    .set({ state: 'sold' })
    .where(eq(schema.occupancy.orderId, f.orderId))
  await assert.rejects(
    finalizeWithRepository(f.repo(), 'u', 99),
    /INVENTORY_INVARIANT/,
  )
  const result = await f.read()
  assert.equal(result.order.status, 'awaiting_proof')
  assert.equal(result.order.proofAssetId, null)
  const asset = (
    await database
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, f.assetId))
  ).at(0)!
  assert.equal(asset.status, 'pending')
})
