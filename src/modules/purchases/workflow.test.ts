import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancelWithRepository,
  adminCancelWithRepository,
  finalizeWithRepository,
  reviewWithRepository,
  snapshotInstructions,
} from './workflow'
import type { WorkflowRepository, WorkflowOrder } from './workflow'

function fixture(
  initialStatus: WorkflowOrder['status'] = 'awaiting_proof',
  deadline = 100,
) {
  let order: WorkflowOrder = {
    id: 'o',
    userId: 'u',
    status: initialStatus,
    expiresAt: deadline,
    proofVerified: false,
  }
  let held = true
  let events: string[] = []
  const repo: WorkflowRepository = {
    async transaction(operation) {
      const next = { ...order }
      let nextHeld = held
      const nextEvents = [...events]
      const result = await operation({
        async lock() {
          return next
        },
        async expire(now) {
          if (next.status === 'awaiting_proof' && now >= next.expiresAt) {
            next.status = 'expired'
            nextHeld = false
            nextEvents.push('expired')
          }
        },
        async transition(status, reason) {
          next.status = status
          if (status === 'rejected' || status === 'cancelled') nextHeld = false
          nextEvents.push(reason)
        },
        async verifyProof() {
          next.proofVerified = true
        },
      })
      order = next
      held = nextHeld
      events = nextEvents
      return result
    },
  }
  return { repo, read: () => ({ order, held, events }) }
}
test('admin cancels pending reservations without proof, preserving audit and idempotency', async () => {
  const f = fixture()
  assert.throws(
    () => adminCancelWithRepository(f.repo, 'client', 'Cancel request', 99),
    /FORBIDDEN/,
  )
  assert.throws(
    () => adminCancelWithRepository(f.repo, 'admin', '', 99),
    /REASON_REQUIRED/,
  )
  assert.equal(
    (await adminCancelWithRepository(f.repo, 'admin', 'Cancel request', 99))
      .status,
    'cancelled',
  )
  await adminCancelWithRepository(f.repo, 'admin', 'Cancel request', 99)
  assert.equal(f.read().held, false)
  assert.deepEqual(f.read().events, ['Cancel request'])
  await assert.rejects(
    adminCancelWithRepository(
      fixture('paid').repo,
      'admin',
      'Cancel request',
      99,
    ),
    /CANNOT_CANCEL/,
  )
  await assert.rejects(
    adminCancelWithRepository(
      fixture('reviewing').repo,
      'admin',
      'Cancel request',
      99,
    ),
    /CANNOT_CANCEL/,
  )
  const expired = fixture()
  assert.equal(
    (
      await adminCancelWithRepository(
        expired.repo,
        'admin',
        'Expired cancellation',
        100,
      )
    ).status,
    'expired',
  )
  assert.equal(expired.read().held, false)
})
test('cancel expired commits release instead of throwing and rolling back expiry', async () => {
  const f = fixture()
  assert.deepEqual(await cancelWithRepository(f.repo, 'u', 100), {
    status: 'expired',
  })
  assert.equal(f.read().held, false)
  assert.deepEqual(f.read().events, ['expired'])
})
test('finalize uploaded after exact deadline commits expiry and refuses receipt', async () => {
  const f = fixture()
  const result = await finalizeWithRepository(f.repo, 'u', 100)
  assert.equal(result.status, 'expired')
  assert.equal(f.read().held, false)
  assert.equal(f.read().order.proofVerified, false)
})
test('timely verified receipt reviewing has no expiry and owner only', async () => {
  const f = fixture()
  await assert.rejects(finalizeWithRepository(f.repo, 'other', 99))
  assert.equal(
    (await finalizeWithRepository(f.repo, 'u', 99)).status,
    'reviewing',
  )
  assert.equal(
    (await reviewWithRepository(f.repo, 'admin', 'paid', 'approved', 1000))
      .status,
    'paid',
  )
  assert.equal(f.read().held, true)
})
test('approve requires verified backend receipt; duplicate approval keeps audit without notifications', async () => {
  const bad = fixture('reviewing')
  await assert.rejects(
    reviewWithRepository(bad.repo, 'admin', 'paid', 'approved', 99),
  )
  const f = fixture()
  await finalizeWithRepository(f.repo, 'u', 99)
  await reviewWithRepository(f.repo, 'admin', 'paid', 'approved', 999)
  await reviewWithRepository(f.repo, 'admin', 'paid', 'approved', 1000)
  assert.equal(
    f.read().events.filter((e) => e === 'purchase.approved').length,
    0,
  )
})
test('reject reviewing releases only occupancy, reason required, non-admin denied', async () => {
  const f = fixture()
  await finalizeWithRepository(f.repo, 'u', 99)
  assert.throws(() =>
    reviewWithRepository(f.repo, 'client', 'rejected', 'bad', 999),
  )
  assert.throws(() =>
    reviewWithRepository(f.repo, 'admin', 'rejected', '', 999),
  )
  await reviewWithRepository(
    f.repo,
    'admin',
    'rejected',
    'Unreadable receipt',
    999,
  )
  assert.equal(f.read().held, false)
  assert.equal(f.read().order.status, 'rejected')
  assert.ok(!f.read().events.includes('purchase.rejected'))
})
test('instructions snapshot is independent of later settings edits', () => {
  const settings = {
    bank: 'B',
    beneficiary: 'N',
    account: '123',
    instructions: 'Pay',
  }
  const snapshot = snapshotInstructions(settings)
  settings.account = '456'
  assert.equal(snapshot!.account, '123')
  assert.equal(snapshotInstructions(null), null)
})
