import test from 'node:test'
import assert from 'node:assert/strict'
import {
  expires,
  quote,
  validateTickets,
  assertSamePayload,
  canCancel,
  assertSalesOpen,
} from './domain'

test('expiry is inclusive and reviewing never expires', () => {
  assert.equal(expires('awaiting_proof', 100, 100), true)
  assert.equal(expires('awaiting_proof', 100, 99), false)
  assert.equal(expires('reviewing', 100, 999), false)
})
test('integer cents and fee snapshot', () => {
  assert.deepEqual(quote(101, 3, 250), {
    subtotalCents: 303,
    feeCents: 8,
    totalCents: 303,
  })
  assert.throws(() => quote(1.5, 1, 0))
})
test('tickets reject duplicates, fractions and out of range', () => {
  assert.deepEqual(validateTickets([3, 1], 3), [1, 3])
  for (const tickets of [
    [1, 1],
    [0],
    [2001],
    [1.2],
    [],
    Array.from({ length: 1001 }, (_, i) => i + 1),
  ])
    assert.throws(() => validateTickets(tickets, 2000))
})
test('idempotency verifies payload rather than silently reusing key', () => {
  assertSamePayload('a', 'a')
  assert.throws(() => assertSamePayload('a', 'b'))
})
test('sales deadline inclusive, active only, uses injected clock', () => {
  assert.doesNotThrow(() => assertSalesOpen('active', 100, 99))
  assert.throws(() => assertSalesOpen('active', 100, 100))
  assert.throws(() => assertSalesOpen('paused', 100, 99))
  assert.throws(() => assertSalesOpen('active', Number.NaN, 99))
  assert.throws(() => assertSalesOpen('active', 100, Number.NaN))
})
test('cancel only own awaiting proof', () => {
  assert.equal(canCancel('u', 'u', 'awaiting_proof'), true)
  assert.equal(canCancel('u', 'v', 'awaiting_proof'), false)
  assert.equal(canCancel('u', 'u', 'reviewing'), false)
  assert.equal(canCancel('u', 'u', 'paid'), false)
})
