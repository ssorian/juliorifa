import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkoutKey,
  restoreCheckout,
  makeCheckout,
  readCheckout,
  nextIntent,
} from './checkout'

test('network retry and new tab retain the same intent; changing picks creates a new intent', () => {
  const first = nextIntent(null, [0, 2], () => 'a'.repeat(32))
  assert.deepEqual(
    nextIntent(first, [2, 0], () => 'b'.repeat(32)),
    first,
  )
  assert.equal(
    nextIntent(first, [0, 3], () => 'b'.repeat(32)).id,
    'b'.repeat(32),
  )
  const raw = JSON.stringify(
    makeCheckout('11111111-1111-4111-8111-111111111111', [0, 2], 100, first.id),
  )
  assert.equal(readCheckout(raw, 101)?.intentId, first.id)
  assert.deepEqual(
    restoreCheckout(
      raw,
      '11111111-1111-4111-8111-111111111111',
      new Set([0]),
      101,
    ),
    [0],
  )
  assert.equal(
    readCheckout(
      JSON.stringify({ ...JSON.parse(raw), intentId: 'unsafe' }),
      101,
    ),
    null,
  )
})
test('selection survives another tab and revalidates availability', () => {
  const pending = makeCheckout('r1', [1, 2, 3], 100)
  const serialized = JSON.stringify(pending)
  assert.deepEqual(
    restoreCheckout(serialized, 'r1', new Set([2, 3]), 101),
    [2, 3],
  )
  assert.equal(checkoutKey('a'.repeat(32)), `nova.checkout.${'a'.repeat(32)}`)
})
test('expired, corrupt, wrong raffle, oversize and noninteger carts rejected', () => {
  const pending = makeCheckout('r1', [1], 100)
  for (const input of [
    'oops',
    JSON.stringify({ ...pending, picks: Array(1001).fill(1) }),
    JSON.stringify({ ...pending, picks: [1.5] }),
    JSON.stringify({ ...pending, picks: ['1'] }),
  ]) {
    assert.deepEqual(restoreCheckout(input, 'r1', new Set([1]), 101), [])
  }
  assert.deepEqual(
    restoreCheckout(JSON.stringify(pending), 'r2', new Set([1]), 101),
    [],
  )
  assert.deepEqual(
    restoreCheckout(
      JSON.stringify(pending),
      'r1',
      new Set([1]),
      100 + 31 * 60_000,
    ),
    [],
  )
  assert.equal(checkoutKey('//evil'), undefined)
})
