import assert from 'node:assert/strict'
import { available, numberState, seed, shuffled } from './model'

const store = structuredClone(seed)
const raffle = store.raffles[0]
assert.equal(numberState(store, raffle, -1), 'outside')
assert.equal(numberState(store, raffle, 10000), 'outside')
assert.equal(numberState(store, raffle, 0), 'reserved')
assert.equal(numberState(store, raffle, 20), 'sold')
assert.equal(numberState(store, raffle, 9000), 'blocked')
assert.equal(numberState(store, raffle, 8999), 'available')
const before = available(store, raffle).length
store.orders[0].status = 'cancelled'
assert.equal(available(store, raffle).length, before + 20)
assert.equal(numberState(store, raffle, 0), 'available')
store.orders[0].status = 'paid'
assert.equal(available(store, raffle).length, before)
assert.equal(numberState(store, raffle, 0), 'sold')
const original = [1, 2, 3, 4]
assert.deepEqual(
  shuffled(original, () => 0),
  [2, 3, 4, 1],
)
assert.deepEqual(original, [1, 2, 3, 4])
assert.deepEqual(
  shuffled([], () => 0),
  [],
)
console.log(
  'PASS: range, sold/reserved/blocked, cancellation release, payment inventory, deterministic shuffle',
)
