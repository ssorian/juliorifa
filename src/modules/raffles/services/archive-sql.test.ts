import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { testDatabase } from '../../purchases/db/testing'
import { draws, occupancy, purchases } from '../../../db/schema'

if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('archive SQL in-memory regression', () => {
    const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import', 'tsx', '--test', fileURLToPath(import.meta.url)], {
      encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    })
    assert.equal(child.status, 0, child.stdout + child.stderr)
    assert.match(child.stdout, /SQL correlates/)
  })
} else {
  const f = await testDatabase()
  mock.module('@tanstack/react-start/server-only', { namedExports: {} })
  mock.module('../../../db/index.ts', { namedExports: { db: f.database } })
  mock.module('../../auth/services/authorization.ts', { namedExports: { requireAdmin: async () => ({ id: 'a' }) } })
  const { detail, list, archive } = await import('./backend')
  test('SQL correlates results, purchases and occupancy only to the target raffle', async (t) => {
    try {
      const future = new Date(Date.now() + 86400000)
      await t.test('future empty raffles can be manually archived in every editable status', async () => {
        for (const status of ['active', 'paused', 'scheduled', 'draft'] as const) {
          const r = await f.raffle({ status, salesDeadline: future, drawAt: future })
          assert.equal((await detail(r.id, true)).canArchive, true)
          assert.equal((await detail(r.id, true)).archiveWithoutDraw, true)
          await archive(r.id)
          await archive(r.id)
          assert.equal((await detail(r.id, true)).status, 'archived')
        }
      })
      await t.test('future historical purchases and any occupancy prevent early retirement', async () => {
        const targets = []
        for (const status of ['cancelled', 'rejected', 'expired'] as const) {
          const r = await f.raffle({ salesDeadline: future, drawAt: future })
          await f.order(r.id, status, [0])
          targets.push(r)
        }
        for (const state of ['blocked', 'sold', 'reserved', 'reviewing'] as const) {
          const r = await f.raffle({ salesDeadline: future, drawAt: future })
          const other = await f.raffle()
          const order = await f.order(other.id, 'cancelled', [0])
          await f.database.insert(occupancy).values({ raffleId: r.id, ticketNumber: 0, state, orderId: state === 'blocked' ? null : order.id })
          targets.push(r)
        }
        const page = await list(0, 100, true)
        for (const r of targets) {
          assert.equal(page.find(x => x.id === r.id)?.canArchive, false)
          await assert.rejects(archive(r.id), /DRAW_REQUIRED_BEFORE_ARCHIVE/)
          assert.equal((await detail(r.id, true)).status, 'active')
        }
      })
      const empty = await f.raffle()
      const other = await f.raffle({ status: 'drawn' })
      const winner = await f.order(other.id, 'paid', [0])
      await f.order(other.id, 'reviewing', [1])
      await f.database.insert(draws).values({ id: randomUUID(), raffleId: other.id, winnerTicket: 0, winnerOrderId: winner.id, candidateDigest: 'fixture', actorId: 'a' })
      const ownPaid = await f.raffle()
      const paid = await f.order(ownPaid.id, 'paid', [0])
      await f.database.delete(occupancy).where(eq(occupancy.orderId, paid.id))
      const reviewing = await f.raffle()
      const reviewOrder = await f.order(reviewing.id, 'reviewing', [0], { expiresAt: new Date(0) })
      await f.database.delete(occupancy).where(eq(occupancy.orderId, reviewOrder.id))
      const rejectedExpiry = await f.order(reviewing.id, 'awaiting_proof', [1], { expiresAt: new Date(0) })
      const sold = await f.raffle()
      const cancelled = await f.order(sold.id, 'cancelled', [0])
      await f.database.insert(occupancy).values({ raffleId: sold.id, ticketNumber: 0, state: 'sold', orderId: cancelled.id })
      const expired = await f.raffle()
      const expiredOrder = await f.order(expired.id, 'awaiting_proof', [0], { expiresAt: new Date(0) })
      const inconsistent = await f.raffle()
      await f.database.insert(occupancy).values({ raffleId: inconsistent.id, ticketNumber: 0, state: 'reserved', orderId: expiredOrder.id })
      const live = await f.raffle()
      await f.order(live.id, 'awaiting_proof', [0], { expiresAt: new Date(Date.now() + 60000) })
      const emptyDto = await detail(empty.id, true)
      assert.equal(emptyDto.canArchive, true, 'unrelated payments/review/result must not block empty target')
      assert.equal(emptyDto.archiveWithoutDraw, true, 'unrelated result is not this raffle result')
      const resultDto = await detail(other.id, true)
      assert.equal(resultDto.canArchive, true)
      assert.equal(resultDto.archiveWithoutDraw, false, 'actual result detected')
      const page = await list(0, 100, true)
      for (const r of [ownPaid, reviewing, sold, inconsistent, live]) {
        assert.equal(page.find(x => x.id === r.id)?.canArchive, false, `unsafe eligibility ${r.id}`)
        await assert.rejects(archive(r.id), /DRAW_REQUIRED_BEFORE_ARCHIVE/)
      }
      const [retainedReview] = await f.database.select().from(purchases).where(eq(purchases.id, reviewOrder.id))
      const [committedExpiry] = await f.database.select().from(purchases).where(eq(purchases.id, rejectedExpiry.id))
      assert.equal(retainedReview.status, 'reviewing', 'reviewing never expires')
      assert.equal(committedExpiry.status, 'expired', 'expiry commits despite rejected archival')
      assert.equal((await f.database.select().from(occupancy).where(eq(occupancy.orderId, rejectedExpiry.id))).length, 0)
      assert.equal((await detail(expired.id, true)).canArchive, true)
      await archive(expired.id)
      const [order] = await f.database.select().from(purchases).where(eq(purchases.id, expiredOrder.id))
      assert.equal(order.status, 'expired')
      assert.equal((await f.database.select().from(occupancy).where(eq(occupancy.orderId, expiredOrder.id))).length, 0, 'existing expiration releases reserved occupancy')
      await archive(empty.id)
      assert.equal((await detail(empty.id, true)).status, 'archived')
    } finally { await f.pg.close() }
  })
}
