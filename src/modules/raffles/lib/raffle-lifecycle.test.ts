import test from 'node:test'
import assert from 'node:assert/strict'
import { raffleLifecycle, assertArchivable } from './raffle-lifecycle'

const deadline = new Date('2026-01-01T00:00:00Z')
const now = new Date('2026-01-02T00:00:00Z')
test('completed is server-clock presentation, not sold-out or paused/scheduled', () => {
  for (const status of ['active', 'closed', 'drawn']) {
    assert.deepEqual(raffleLifecycle(status, deadline, now), { salesOpen: false, completed: true })
  }
  for (const status of ['paused', 'scheduled', 'draft', 'archived']) {
    assert.equal(raffleLifecycle(status, deadline, now).completed, false)
  }
  assert.equal(raffleLifecycle('active', deadline, deadline).completed, true)
  assert.equal(raffleLifecycle('active', now, deadline).salesOpen, true)
})
test('empty archive exception requires both dates and no paid, pending or inconsistent occupancy', () => {
  const empty = { drawAt: deadline, paid: false, pending: false, occupied: false }
  assertArchivable('active', deadline, now, false, empty)
  assertArchivable('paused', deadline, now, false, empty)
  for (const flag of ['paid', 'pending', 'occupied'] as const)
    assert.throws(() => assertArchivable('active', deadline, now, false, { ...empty, [flag]: true }))
  assert.throws(() => assertArchivable('active', deadline, now, false, { ...empty, drawAt: new Date(now.getTime() + 1) }))
  assert.throws(() => assertArchivable('active', new Date(now.getTime() + 1), now, false, empty))
  assert.throws(() => assertArchivable('draft', deadline, now, false, empty))
})
test('archive requires completed sale and actual result; archived retries remain safe', () => {
  assert.throws(() => assertArchivable('active', deadline, now, false))
  assert.throws(() => assertArchivable('drawn', now, deadline, true))
  assertArchivable('drawn', deadline, now, true)
  assertArchivable('archived', deadline, now, true)
})
