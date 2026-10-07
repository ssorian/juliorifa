import test from 'node:test'
import assert from 'node:assert/strict'
import { canClean } from './recovery-domain'

test('cleanup never attached/verified proof, requires older than 24h and stale lease', () => {
  const base = {
    kind: 'image',
    status: 'verified',
    createdAt: 0,
    leaseUntil: null,
    proofAttached: false,
    imageAttached: false,
  }
  assert.equal(canClean(base, 86400000), false)
  assert.equal(canClean(base, 86400001), true)
  assert.equal(canClean({ ...base, imageAttached: true }, 86400001), false)
  assert.equal(canClean({ ...base, kind: 'proof' }, 86400001), false)
  assert.equal(
    canClean(
      { ...base, kind: 'proof', status: 'pending', proofAttached: true },
      86400001,
    ),
    false,
  )
  assert.equal(
    canClean({ ...base, status: 'cleaning', leaseUntil: 90000000 }, 86400001),
    false,
  )
  assert.equal(
    canClean({ ...base, status: 'cleaning', leaseUntil: 86400000 }, 86400001),
    true,
  )
})
