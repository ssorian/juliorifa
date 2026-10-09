import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTicket, ticketLabel, revalidatePicks } from './presentation'
import { money } from '../../../lib/utils/money'
import {
  ownKey,
  purchaseFlags,
  statusLabel,
} from '../../purchases/lib/presentation'

test('public numbering includes zero, padded/raw input and bounded restore', () => {
  assert.equal(parseTicket('0000', 0, 10), 0)
  assert.equal(parseTicket('9', 0, 10), 9)
  for (const input of ['10', '-1', '1.5', 'x', ''])
    assert.equal(parseTicket(input, 0, 10), null)
  assert.equal(ticketLabel(0, 0, 10), '0000')
  assert.deepEqual(
    revalidatePicks([0, 0, 1, 10], 0, 10, new Set([0, 1]), true),
    [0, 1],
  )
  assert.deepEqual(revalidatePicks([0], 0, 10, new Set([0]), false), [])
  assert.match(money(12345), /123[.,]45/)
})
test('own query keys isolate identities and reviewing never expires or means paid', () => {
  assert.notDeepEqual(ownKey('a', 'list'), ownKey('b', 'list'))
  assert.deepEqual(purchaseFlags('reviewing', '2000-01-01', 1e12), {
    upload: false,
    cancel: false,
    paid: false,
    retained: true,
  })
  assert.equal(
    purchaseFlags('awaiting_proof', '2000-01-01', 1e12).upload,
    false,
  )
  assert.equal(purchaseFlags('paid', '2000-01-01', 1e12).paid, true)
  assert.equal(statusLabel('reviewing'), 'Por confirmar')
})
