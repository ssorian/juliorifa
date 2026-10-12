import test from 'node:test'
import assert from 'node:assert/strict'
import { cronResponse } from '../services/cron-http'
import { testDatabase } from '../../purchases/db/testing'
import { runAutomaticDraws } from '../services/automatic-draw'
import type { DrawDatabase } from '../services/draw-repository'
import { eq } from 'drizzle-orm'
import { draws, purchases, user } from '../../../db/schema'
import { adminWinnerContact } from '../services/winner-contact'
import { publicDrawDTO, performDraw } from '../services/draw-repository'

test('disabled cron always returns private 410 and never invokes a runner', async () => {
  let calls = 0
  for (const secret of [undefined, '', 'fixture-secret']) {
    for (const header of [undefined, 'Bearer wrong', 'Bearer fixture-secret']) {
      const response = await cronResponse(new Request('http://localhost/api/cron/draw', {
        headers: header ? { authorization: header } : {},
      }), secret, async () => { calls++; throw new Error('private@example.invalid') })
      assert.equal(response.status, 410)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.deepEqual(await response.json(), { error: 'AUTOMATIC_DRAW_DISABLED' })
    }
  }
  assert.equal(calls, 0)
})
test('legacy automatic service cannot query a database or execute a draw', async () => {
  const database = new Proxy({}, { get() { throw new Error('DATABASE_TOUCHED') } })
  await assert.rejects(runAutomaticDraws(database), /AUTOMATIC_DRAW_DISABLED/)
})
test('manual audit, contact privacy, expiry and retry idempotency; historical automatic constraint preserved', async () => {
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
    await performDraw(database, ready.id, 'a', () => 100)
    const [record] = await f.database
      .select()
      .from(draws)
      .where(eq(draws.raffleId, ready.id))
    assert.equal(record.source, 'manual')
    assert.equal(record.actorId, 'a')
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
      (await performDraw(database, ready.id, 'a', () => 100)).id,
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
