import test from 'node:test'
import assert from 'node:assert/strict'
import { canConfirmManualDraw } from './manual-draw'

const ready = {
  status: 'closed', due: true, busy: false, result: null,
  readiness: { paidTickets: 1, stock: { reserved: 0, reviewing: 0 } },
}
test('manual confirmation requires fresh readiness, both dates and no existing result', () => {
  assert.equal(canConfirmManualDraw(ready), true)
  for (const change of [
    { status: 'archived' }, { status: 'draft' }, { due: false },
    { busy: true }, { result: undefined }, { result: {} },
    { readiness: undefined },
    { readiness: { paidTickets: 0, stock: { reserved: 0, reviewing: 0 } } },
    { readiness: { paidTickets: 1, stock: { reserved: 1, reviewing: 0 } } },
    { readiness: { paidTickets: 1, stock: { reserved: 0, reviewing: 1 } } },
  ]) assert.equal(canConfirmManualDraw({ ...ready, ...change }), false)
})
