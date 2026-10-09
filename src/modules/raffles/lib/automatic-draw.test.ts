import test from 'node:test'
import assert from 'node:assert/strict'
import { cronResponse } from '../services/cron-http'
import { testDatabase } from '../../purchases/db/testing'
import { eligibleDraws, runAutomaticDraws } from '../services/automatic-draw'
import type { DrawDatabase } from '../services/draw-repository'
import { eq } from 'drizzle-orm'
import { draws, purchases, user } from '../../../db/schema'
import { adminWinnerContact } from '../services/winner-contact'
import { publicDrawDTO, performDraw } from '../services/draw-repository'

test('cron fails closed and never runs without exact Bearer authorization; no PII errors', async () => {
  let calls = 0
  const run = async () => {
    calls++
    return { completed: 1, deferred: 0, failed: 0 }
  }
  for (const [secret, header, status] of [
    [undefined, 'Bearer undefined', 503],
    ['', 'Bearer ', 503],
    ['fixture-secret', null, 401],
    ['fixture-secret', 'Bearer bad', 401],
    ['fixture-secret', 'bearer fixture-secret', 401],
  ] as const) {
    const response = await cronResponse(
      new Request('http://localhost/api/cron/draw', {
        headers: header ? { authorization: header } : {},
      }),
      secret,
      run,
    )
    assert.equal(response.status, status)
  }
  assert.equal(calls, 0)
  const request = new Request('http://localhost/api/cron/draw', {
    headers: { authorization: 'Bearer fixture-secret' },
  })
  assert.equal((await cronResponse(request, 'fixture-secret', run)).status, 200)
  assert.equal(calls, 1)
  const failure = await cronResponse(request, 'fixture-secret', async () => {
    throw new Error('private@example.invalid')
  })
  assert.equal(failure.status, 500)
  assert.doesNotMatch(await failure.text(), /private/)
})
test('ready after blocked qualifies before limit; automatic audit, legacy and retry idempotency', async () => {
  const f = await testDatabase()
  try {
    const blocked = await f.raffle()
    await f.order(blocked.id, 'paid', [0])
    const review = await f.order(blocked.id, 'reviewing', [1])
    const empty = await f.raffle()
    const ready = await f.raffle()
    await f.order(ready.id, 'paid', [0])
    const expired = await f.order(ready.id, 'awaiting_proof', [1], {
      expiresAt: new Date(100),
    })
    const database = f.database as unknown as DrawDatabase
    assert.deepEqual(await eligibleDraws(database, new Date(100), 1), [
      ready.id,
    ])
    assert.deepEqual(await runAutomaticDraws(database, () => 100, 1), {
      completed: 1,
      deferred: 0,
      failed: 0,
    })
    assert.deepEqual(await runAutomaticDraws(database, () => 100, 1), {
      completed: 0,
      deferred: 0,
      failed: 0,
    })
    const [record] = await f.database
      .select()
      .from(draws)
      .where(eq(draws.raffleId, ready.id))
    assert.equal(record.source, 'automatic')
    assert.equal(record.actorId, null)
    assert.equal(await adminWinnerContact(database, record.winnerOrderId), null)
    await f.database
      .update(user)
      .set({ phone: '+525512345678' })
      .where(eq(user.id, 'u'))
    assert.deepEqual(await adminWinnerContact(database, record.winnerOrderId), {
      name: 'Fixture',
      phone: '+525512345678',
      whatsapp: 'https://wa.me/525512345678',
    })
    assert.deepEqual(
      Object.keys(publicDrawDTO(record)).sort(),
      [
        'raffleId',
        'winnerTicket',
        'drawnAt',
        'candidateCount',
        'candidateDigest',
        'algorithm',
      ].sort(),
    )
    assert.equal(
      (await performDraw(database, ready.id, null, () => 100)).id,
      record.id,
    )
    assert.equal(
      (
        await f.database
          .select()
          .from(purchases)
          .where(eq(purchases.id, review.id))
      )[0].status,
      'reviewing',
    )
    assert.equal(
      (
        await f.database
          .select()
          .from(purchases)
          .where(eq(purchases.id, expired.id))
      )[0].status,
      'expired',
    )
    assert.equal(
      (
        await f.database
          .select()
          .from(draws)
          .where(eq(draws.raffleId, empty.id))
      ).length,
      0,
    )
    await assert.rejects(
      f.database
        .insert(draws)
        .values({
          ...record,
          id: crypto.randomUUID(),
          raffleId: empty.id,
          source: 'automatic',
          actorId: 'a',
        }),
    )
  } finally {
    await f.pg.close()
  }
})
