import assert from 'node:assert/strict'
import { renderToString } from 'react-dom/server'
import { RevenueChart } from '../../dashboard/components/RevenueChart'
import { seed } from '../model'
import {
  parseNumbers,
  adjustAvailability,
  validateRaffle,
  inventoryCsv,
} from './management'
import {
  finance,
  dailyRevenue,
  dateKey,
  shortDate,
} from '../../dashboard/lib/finance'
import { validateImageFile } from '../../dashboard/lib/image'
import { publicRoute, adminTab } from './navigation'

const store = structuredClone(seed),
  r = store.raffles[0]
assert.deepEqual(parseNumbers('0200-0202, 201', r), [200, 201, 202])
for (const value of ['', '1-x', '205-200', '-1', '10000', '200-1200'])
  assert.throws(() => parseNumbers(value, r))
const next = adjustAvailability(store, r, '200-202', true)
assert.deepEqual(
  next.raffles[0].blocked.filter((n) => n >= 200 && n <= 202),
  [200, 201, 202],
)
assert.equal(store.raffles[0].blocked.includes(200), false)
assert.throws(
  () => adjustAvailability(store, r, '0,200', true),
  /vendidos o reservados/,
)
assert.equal(
  adjustAvailability(
    next,
    next.raffles[0],
    '200-202',
    false,
  ).raffles[0].blocked.includes(200),
  false,
)
assert.throws(
  () => adjustAvailability(store, r, '9000', true),
  /ya están bloqueados/,
)
assert.throws(() => adjustAvailability(store, r, '200', false), /no contiene/)
assert.match(inventoryCsv(store, r), /numero,estado/)
assert.match(inventoryCsv(store, r), /0000,reserved/)
assert.throws(
  () => validateRaffle({ ...r, features: [['Pantalla', '']] }, store, r),
  /característica/,
)
assert.throws(() => validateRaffle({ ...r, quantity: 100 }, store, r), /fuera/)
assert.throws(() => validateRaffle({ ...r, start: 1 }, store, r), /numeración/)
const cancelled = structuredClone(store)
cancelled.orders.forEach((o) => {
  o.status = 'cancelled'
})
assert.throws(
  () =>
    validateRaffle({ ...r, quantity: 100, blocked: [] }, cancelled, {
      ...r,
      blocked: [],
    }),
  /fuera/,
)
assert.throws(
  () => validateRaffle({ ...r, price: 1.001 }, store, r),
  /decimales/,
)
assert.equal(
  validateRaffle({ ...r, features: [[' Pantalla ', ' OLED ']] }, store, r)
    .features[0][1],
  'OLED',
)
assert.throws(
  () => validateImageFile({ type: 'image/svg+xml', size: 100 }),
  /PNG/,
)
assert.throws(
  () => validateImageFile({ type: 'image/png', size: 2097153 }),
  /2 MB/,
)
assert.doesNotThrow(() =>
  validateImageFile({ type: 'image/webp', size: 2097152 }),
)
const orders = [
  {
    ...store.orders[0],
    status: 'paid',
    date: '2026-07-01T05:00:00Z',
    fee: 14.5,
  },
  {
    ...store.orders[1],
    status: 'pending',
    date: '2026-07-01T18:00:00Z',
    fee: 11.6,
  },
]
const sample = { ...store, orders }
assert.equal(finance(sample).collected, 500)
assert.equal(finance(sample).fees, 14.5)
assert.equal(finance(sample).pending, 400)
assert.equal(finance(sample, 'iphone').pending, 0)
assert.equal(finance(sample, 'galaxy').pending, 400)
assert.equal(finance(sample, 'galaxy').collected, 0)
assert.equal(
  finance(sample).profit,
  500 - 14.5 - store.raffles.reduce((sum, x) => sum + x.cost + x.expenses, 0),
)
const days = dailyRevenue(orders, '2026-07-01T18:00:00Z')
assert.equal(shortDate('2026-06-18'), '18 jun 2026')
assert.equal(shortDate('2026-07-01T05:00:00Z'), '30 jun 2026')
assert.equal(shortDate('2026-07-01T06:00:00Z'), '01 jul 2026')
assert.equal(dateKey('2026-07-01T05:00:00Z'), '2026-06-30')
const chart = renderToString(
  RevenueChart({
    chart: days.map((d) => ({
      date: d.date,
      paidCents: Math.round(d.value * 100),
      orders: orders.filter(
        (o) => o.status === 'paid' && dateKey(o.date) === d.date,
      ).length,
    })),
  }),
)
const titles = [...chart.matchAll(/<title>(.*?)<\/title>/g)]
assert.equal(titles.length, 15)
assert.ok(titles.every((title) => !title[1].includes('<!--')))
assert.match(chart, /<title>18 jun 2026: [^<]+<\/title>/)
assert.equal(days.length, 14)
assert.equal(days.at(-2)?.value, 500)
assert.equal(days.at(-1)?.value, 0)
assert.equal(
  days.reduce((sum, d) => sum + d.value, 0),
  500,
)
assert.equal(publicRoute('#rifa/iphone-16-pro-max').id, 'iphone')
assert.equal(publicRoute('#como-funciona').section, 'como-funciona')
assert.equal(publicRoute('#rifa/demo-123').id, 'demo-123')
assert.equal(adminTab('#compras'), 'Compras')
assert.equal(adminTab('#invalid'), 'Resumen')
console.log(
  'PASS: atomic bulk inventory, CSV, raffle specs/range/money, image limits, fees/timezone/chart, hash navigation',
)
