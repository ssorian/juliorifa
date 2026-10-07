import test from 'node:test'
import assert from 'node:assert/strict'
import { computeFinance } from './finance-domain'

test('finance snapshots, fee expense not surcharge, costs/filter and 14 Mexico approval days', () => {
  const now = Date.parse('2026-01-15T05:30:00Z') // Jan 14 Mexico City
  const raffles = [
    { id: 'r', prizeCostCents: 100, expensesCents: 50 },
    { id: 'other', prizeCostCents: 1000, expensesCents: 0 },
  ]
  const orders = [
    {
      raffleId: 'r',
      status: 'paid',
      subtotalCents: 1000,
      feeCents: 25,
      ticketCount: 2,
      reviewedAt: new Date('2026-01-15T05:00:00Z'),
    },
    {
      raffleId: 'r',
      status: 'reviewing',
      subtotalCents: 500,
      feeCents: 99,
      ticketCount: 1,
      reviewedAt: null,
    },
    {
      raffleId: 'other',
      status: 'paid',
      subtotalCents: 5000,
      feeCents: 100,
      ticketCount: 3,
      reviewedAt: new Date('2026-01-15T06:00:00Z'),
    },
  ]
  const metrics = computeFinance(raffles, orders, now, 'r')
  assert.equal(metrics.paidCents, 1000)
  assert.equal(metrics.reviewingCents, 500)
  assert.equal(metrics.feeExpenseCents, 25)
  assert.equal(metrics.resultCents, 825)
  assert.equal(metrics.chart.length, 14)
  assert.equal(metrics.chart.at(-1)?.date, '2026-01-14')
  assert.equal(metrics.today.paidCents, 1000)
  assert.equal(metrics.today.tickets, 2)
  assert.throws(() =>
    computeFinance(raffles, [{ ...orders[0], subtotalCents: 1.5 }], now),
  )
})
