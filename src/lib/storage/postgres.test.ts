import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { testDatabase } from '../../modules/purchases/db/testing'
import * as schema from '../../db/schema'
import { createUploadGuard } from './guard-repository'
import { withUploadGuard } from './guard'
import { errorResponse } from './http'
import { createRecoveryRepository } from './recovery-repository'
import type { RecoveryDatabase } from './recovery-repository'
import { recoverStorage } from './recovery-worker'
import { DomainError } from '../../modules/purchases/domain'
import { LEASE_MS, MAX_ATTEMPTS } from './retry'
import { assertImageAttachment } from '../../modules/raffles/services/media-policy'
import { expireBatch } from '../../modules/purchases/expiry-job'
import { parseJobArguments } from '../../../scripts/run-jobs'

let fixture: Awaited<ReturnType<typeof testDatabase>>
before(async () => {
  fixture = await testDatabase()
})
after(() => fixture.pg.close())
const database = () => fixture.database as unknown as RecoveryDatabase
const recovery = () => createRecoveryRepository(database())
const read = async (id: string) =>
  (
    await fixture.database
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, id))
  )[0]
async function image(raffleId: string) {
  const id = randomUUID()
  await fixture.database.insert(schema.mediaAssets).values({
    id,
    key: `images/${id}`,
    kind: 'image',
    ownerId: 'a',
    raffleId,
    status: 'verified',
    mime: 'image/png',
    sizeBytes: 10,
    digest: 'a'.repeat(64),
    createdAt: new Date(0),
    verifiedAt: new Date(0),
    cleanupAvailableAt: new Date(0),
  })
  return read(id)
}

test('expiry job strictly bounded and only awaiting; order/ticket history remains', async () => {
  const raffle = await fixture.raffle()
  for (const ticket of [0, 1, 2])
    await fixture.order(raffle.id, 'awaiting_proof', [ticket])
  const review = await fixture.order(raffle.id, 'reviewing', [3])
  assert.equal((await expireBatch(database(), 1, () => 1000)).expired, 1)
  assert.equal((await expireBatch(database(), 25, () => 1000)).expired, 2)
  const order = (
    await fixture.database
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.id, review.id))
  )[0]
  assert.equal(order.status, 'reviewing')
  assert.equal(
    (
      await fixture.database
        .select()
        .from(schema.occupancy)
        .where(eq(schema.occupancy.orderId, review.id))
    ).length,
    1,
  )
  assert.deepEqual(parseJobArguments(['--storage', '--batch', '5']), {
    help: false,
    execute: false,
    input: { kind: 'storage', batch: 5 },
  })
  assert.throws(() => parseJobArguments(['--all', '--expire']))
  assert.throws(() =>
    parseJobArguments(['--all', '--batch', '26', '--execute']),
  )
})
test('durable upload guard: parallel calls only one decode/PUT; 429 others, no lock during I/O', async () => {
  const target = randomUUID(),
    guard = createUploadGuard(database(), () => 0)
  let unblock!: () => void,
    decodes = 0,
    puts = 0
  const storage = {
    async put() {
      puts++
    },
  }
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const first = withUploadGuard(guard, 'u', target, 'proof', async (lease) => {
    decodes++
    await gate
    await lease.assert()
    await storage.put()
  })
  // Wait until the first DB claim entered its external-I/O phase.
  while (!decodes) await new Promise((resolve) => setTimeout(resolve, 1))
  const denied = await Promise.allSettled(
    Array.from({ length: 3 }, () =>
      withUploadGuard(guard, 'u', randomUUID(), 'image', async () => {
        decodes++
        await storage.put()
      }),
    ),
  )
  for (const result of denied) {
    if (result.status !== 'rejected') assert.fail('Concurrent actor admitted')
    assert.equal(errorResponse(result.reason).status, 429)
  }
  unblock()
  await first
  assert.equal(decodes, 1)
  assert.equal(puts, 1)
})
test('upload expired lease reclaims, stale release cannot clear newer lease; other actor independent and rate bounded', async () => {
  let now = 0
  const guard = createUploadGuard(database(), () => now),
    target = randomUUID()
  const old = await guard.claim('other', target, 'proof')
  now = 300001
  const next = await guard.claim('other', target, 'proof')
  await guard.release(old)
  assert.equal(await guard.owns(next), true)
  await assert.rejects(
    guard.claim('other', randomUUID(), 'image'),
    /UPLOAD_BUSY/,
  )
  assert.equal(await guard.owns(old), false)
  await assert.rejects(guard.claim('a', target, 'proof'), /UPLOAD_BUSY/)
  const independent = await guard.claim('u', randomUUID(), 'proof')
  assert.equal(await guard.owns(independent), true)
  await guard.release(next)
  await guard.release(independent)
  for (let i = 0; i < 5; i++) {
    const lease = await guard.claim('a', randomUUID(), 'image')
    await guard.release(lease)
  }
  await assert.rejects(
    guard.claim('a', randomUUID(), 'image'),
    /UPLOAD_RATE_LIMITED/,
  )
  now += 60000
  const reset = await guard.claim('a', randomUUID(), 'image')
  await guard.release(reset)
})
test('cleanup claims only old unreferenced assets, SDK failure retry succeeds without deleting evidence', async () => {
  const raffle = await fixture.raffle()
  const paid = await fixture.order(raffle.id, 'paid', [0]),
    reviewing = await fixture.order(raffle.id, 'reviewing', [1]),
    rejected = await fixture.order(raffle.id, 'rejected', [2])
  const attached = await image(raffle.id),
    unattached = await image(raffle.id)
  await fixture.database
    .update(schema.raffles)
    .set({ images: [{ key: attached.key, alt: 'Fixture' }] })
    .where(eq(schema.raffles.id, raffle.id))
  const pendingOrder = await fixture.order(raffle.id, 'awaiting_proof', [3]),
    pendingId = randomUUID()
  await fixture.database.insert(schema.mediaAssets).values({
    id: pendingId,
    key: `proofs/${pendingId}`,
    kind: 'proof',
    ownerId: 'u',
    purchaseId: pendingOrder.id,
    status: 'pending',
    mime: 'application/pdf',
    sizeBytes: 10,
    digest: 'b'.repeat(64),
    createdAt: new Date(0),
    cleanupAvailableAt: new Date(0),
  })
  const protectedOrders = [paid, reviewing, rejected]
  const protectedAssets = []
  for (const order of protectedOrders)
    protectedAssets.push(
      (
        await fixture.database
          .select()
          .from(schema.purchases)
          .where(eq(schema.purchases.id, order.id))
      )[0].proofAssetId!,
    )
  const claims = await recovery().claim(25, 86400001)
  assert.deepEqual(
    new Set(claims.map((c) => c.id)),
    new Set([unattached.id, pendingId]),
  )
  for (const claim of claims)
    await recovery().failed(
      claim.id,
      claim.cleanupToken!,
      claim.cleanupAttempts,
      'STORAGE_UNAVAILABLE',
      86400001,
    )
  const deleted: string[] = []
  const result = await recoverStorage(
    recovery(),
    () => ({
      async put() {},
      async url() {
        return ''
      },
      async remove(key) {
        deleted.push(key)
      },
    }),
    25,
    () => 86430002,
  )
  assert.equal(result.deleted, 2)
  assert.equal(deleted.length, 2)
  assert.equal((await read(attached.id)).status, 'verified')
  for (const id of protectedAssets)
    assert.equal((await read(id)).status, 'verified')
  assert.equal((await read(pendingId)).status, 'deleted')
})
test('cleanup lease freezes attach, stale ack cannot overwrite newer worker; dead exhausted claim visible', async () => {
  const raffle = await fixture.raffle(),
    asset = await image(raffle.id)
  const old = (await recovery().claim(25, 86400001)).find(
    (row) => row.id === asset.id,
  )!
  assert.throws(() => assertImageAttachment(old, raffle.id, 'a'))
  const next = (await recovery().claim(25, 86400001 + LEASE_MS + 1)).find(
    (row) => row.id === asset.id,
  )!
  assert.equal(await recovery().deleted(asset.id, old.cleanupToken!), false)
  assert.equal(
    await recovery().failed(
      asset.id,
      old.cleanupToken!,
      1,
      'STORAGE_UNAVAILABLE',
      86400001 + LEASE_MS + 2,
    ),
    false,
  )
  assert.equal(await recovery().deleted(asset.id, next.cleanupToken!), true)
  const exhausted = await image(raffle.id)
  await fixture.database
    .update(schema.mediaAssets)
    .set({
      status: 'cleaning',
      cleanupAttempts: MAX_ATTEMPTS,
      cleanupToken: randomUUID(),
      cleanupUntil: new Date(0),
    })
    .where(eq(schema.mediaAssets.id, exhausted.id))
  await recovery().claim(25, 86400001)
  assert.equal((await read(exhausted.id)).cleanupError, 'LEASE_EXHAUSTED')
  assert.ok((await read(exhausted.id)).cleanupDeadAt)
})
test('recovery worker reports storage failures, never fake deletes', async () => {
  const raffle = await fixture.raffle(),
    asset = await image(raffle.id)
  const result = await recoverStorage(
    recovery(),
    () => {
      throw new DomainError('STORAGE_NOT_CONFIGURED')
    },
    25,
    () => 86400001,
  )
  assert.equal(result.retry, 1)
  assert.equal((await read(asset.id)).status, 'orphan')
  assert.equal((await read(asset.id)).cleanupError, 'STORAGE_NOT_CONFIGURED')
})
