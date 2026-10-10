import test from 'node:test'
import assert from 'node:assert/strict'
import { soldPercentage } from './availability'

test('sold percentage counts paid tickets only and never rounds partial inventory to sold out', () => {
  assert.equal(soldPercentage({sold:1,ticketCount:10}), 10)
  assert.equal(soldPercentage({sold:0,ticketCount:10}), 0)
  assert.equal(soldPercentage({sold:999,ticketCount:1000}), 99)
  assert.equal(soldPercentage({sold:10,ticketCount:10}), 100)
})
