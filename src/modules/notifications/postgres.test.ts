import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { testDatabase } from '../purchases/db/testing'
import * as schema from '../../db/schema'
import { createOutboxRepository } from './repository'
import type { OutboxDatabase } from './repository'
import { LEASE_MS, MAX_ATTEMPTS, retryDelay } from './domain'
import { processOutbox } from './worker'
import { prepareDelivery } from './delivery'
import { sendEmail } from '../../lib/email/service'
import { performDraw } from '../raffles/services/draw-repository'
import type { DrawDatabase } from '../raffles/services/draw-repository'

let fixture: Awaited<ReturnType<typeof testDatabase>>
before(async () => {
  fixture = await testDatabase()
})
after(() => fixture.pg.close())
const repo = () =>
  createOutboxRepository(fixture.database as unknown as OutboxDatabase)
async function event() {
  const raffle = await fixture.raffle(),
    order = await fixture.order(raffle.id, 'paid', [0]),
    id = randomUUID()
  await fixture.database.insert(schema.notificationOutbox).values({
    id,
    event: 'purchase.approved',
    key: order.id,
    payload: { orderId: order.id, userId: 'u', reason: 'Approved' },
    createdAt: new Date(0),
    availableAt: new Date(0),
  })
  return id
}
const read = async (id: string) =>
  (
    await fixture.database
      .select()
      .from(schema.notificationOutbox)
      .where(eq(schema.notificationOutbox.id, id))
  )[0]

test('claim lease serializes conceptual workers; expired reclaim rejects stale sent/fail and sent is idempotent', async () => {
  const id = await event(),
    repository = repo()
  const batches = await Promise.all([
    repository.claim(1, 0),
    repository.claim(1, 0),
  ])
  assert.equal(batches[0].length + batches[1].length, 1)
  const old = batches.flat()[0]
  assert.equal(old.id, id)
  await assert.rejects(repository.retry(id, 0), /EVENT_BUSY/)
  const [next] = await repository.claim(1, LEASE_MS + 1)
  assert.notEqual(old.leaseToken, next.leaseToken)
  assert.equal(await repository.sent(id, old.leaseToken!, LEASE_MS + 2), false)
  assert.equal(
    await repository.failed(
      id,
      old.leaseToken!,
      1,
      'DELIVERY_UNAVAILABLE',
      LEASE_MS + 2,
    ),
    false,
  )
  assert.equal(await repository.sent(id, next.leaseToken!, LEASE_MS + 2), true)
  assert.equal(await repository.sent(id, next.leaseToken!, LEASE_MS + 3), false)
  await assert.rejects(repository.retry(id, LEASE_MS + 3), /ALREADY_SENT/)
})
test('bounded exponential retry deadletters after max; admin repository retry retains original event ID', async () => {
  const id = await event(),
    repository = repo()
  let now = 0
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const [claim] = await repository.claim(1, now)
    assert.equal(claim.id, id)
    assert.equal(claim.attempts, attempt)
    await repository.failed(
      id,
      claim.leaseToken!,
      claim.attempts,
      'EMAIL_NOT_CONFIGURED',
      now,
    )
    assert.equal(
      (await read(id)).availableAt.getTime(),
      now + retryDelay(attempt),
    )
    now += retryDelay(attempt) + 1
  }
  assert.equal((await read(id)).status, 'dead')
  assert.ok((await read(id)).deadAt)
  await repository.retry(id, now)
  assert.equal((await read(id)).id, id)
  assert.equal((await read(id)).attempts, 0)
})
test('worker resolves current verified owner, provider deterministic header, sends outside transaction', async () => {
  const id = await event()
  let sends = 0
  const result = await processOutbox(
    repo(),
    (row) => prepareDelivery(fixture.database, row, 'https://app.test'),
    (message) =>
      sendEmail(
        message,
        async (_url, init) => {
          sends++
          assert.equal(
            new Headers(init?.headers).get('Idempotency-Key'),
            `notification/${id}`,
          )
          const body = JSON.parse(String(init?.body))
          assert.deepEqual(body.to, ['u@example.invalid'])
          assert.match(body.text, /https:\/\/app.test\/mis-compras/)
          return new Response('{}', { status: 200 })
        },
        { key: 'stub', from: 'fixed@example.invalid' },
      ),
    1,
    () => 0,
  )
  assert.equal(result.sent, 1)
  assert.equal(sends, 1)
  assert.equal((await read(id)).status, 'sent')
})
test('unverified owner retries without transport; forged recipient payload cannot choose email', async () => {
  const id = await event()
  await fixture.database
    .update(schema.user)
    .set({ emailVerified: false })
    .where(eq(schema.user.id, 'u'))
  try {
    const result = await processOutbox(
      repo(),
      (row) => prepareDelivery(fixture.database, row, 'https://app.test'),
      async () => {
        throw new Error('must not send')
      },
      1,
      () => 0,
    )
    assert.equal(result.retry, 1)
    assert.equal((await read(id)).lastError, 'RECIPIENT_UNVERIFIED')
  } finally {
    await fixture.database
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, 'u'))
  }
  const record = await read(id)
  await assert.rejects(
    prepareDelivery(
      fixture.database,
      { ...record, payload: { ...record.payload, userId: 'other' } },
      'https://app.test',
    ),
    /RECIPIENT_NOT_FOUND/,
  )
})
test('winner persists when delivery fails; no reroll or duplicate event', async () => {
  const raffle = await fixture.raffle()
  await fixture.order(raffle.id, 'paid', [0])
  const draw = await performDraw(
    fixture.database as unknown as DrawDatabase,
    raffle.id,
    'a',
    () => 100,
    () => 0,
  )
  const result = await processOutbox(
    repo(),
    (row) => prepareDelivery(fixture.database, row, 'https://app.test'),
    async () => {
      throw new Error('provider private body')
    },
    1,
    () => 100,
  )
  assert.equal(result.retry, 1)
  const same = await performDraw(
    fixture.database as unknown as DrawDatabase,
    raffle.id,
    'a',
    () => 101,
    () => {
      throw new Error('never reroll')
    },
  )
  assert.equal(same.id, draw.id)
  const events = await fixture.database
    .select()
    .from(schema.notificationOutbox)
    .where(eq(schema.notificationOutbox.key, raffle.id))
  assert.equal(events.length, 1)
  assert.equal(events[0].lastError, 'DELIVERY_UNAVAILABLE')
})
test('crashed worker at final attempt becomes visible deadletter, not stuck leased forever', async () => {
  const id = await event()
  await fixture.database
    .update(schema.notificationOutbox)
    .set({
      attempts: MAX_ATTEMPTS,
      status: 'leased',
      leaseToken: randomUUID(),
      leaseUntil: new Date(0),
    })
    .where(eq(schema.notificationOutbox.id, id))
  await repo().claim(1, 0)
  assert.equal((await read(id)).status, 'dead')
  assert.equal((await read(id)).lastError, 'LEASE_EXHAUSTED')
})
