import test from 'node:test'
import assert from 'node:assert/strict'
import { reservationDialog } from './reservation-dialog'

test('payment dialog only opens for a committed own reservation; explicit confirmation remains separate', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  assert.deepEqual(reservationDialog(id, 'actor'), { id, userId: 'actor' })
  for (const [purchase, actor] of [
    [null, 'actor'],
    [id, null],
    ['../unsafe', 'actor'],
  ] as const)
    assert.equal(reservationDialog(purchase, actor), null)
})
