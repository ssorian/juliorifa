import assert from 'node:assert/strict'
import { seed } from '../model'
import { parseStore, saveSnapshot } from './storage'

const old = JSON.parse(JSON.stringify(seed))
for (const r of old.raffles) delete r.features
for (const o of old.orders) {
  delete o.date
  delete o.fee
  delete o.email
  delete o.method
}
const migrated = parseStore(JSON.stringify(old))
assert.equal(migrated.raffles[0].features.length, 4)
assert.equal(migrated.orders[0].fee, 0)
assert.doesNotThrow(() => parseStore(JSON.stringify(migrated)))
for (const mutate of [
  (s: typeof seed) => s.raffles.push({ ...s.raffles[0] }),
  (s: typeof seed) => s.orders[0].tickets.push(s.orders[0].tickets[0]),
  (s: typeof seed) => s.orders[0].tickets.push(10000),
  (s: typeof seed) => {
    s.orders[1].raffleId = s.orders[0].raffleId
  },
  (s: typeof seed) => {
    s.raffles[0].image = 'javascript:alert(1)'
  },
  (s: typeof seed) => {
    s.raffles[0].blocked.push(0)
  },
]) {
  const bad = structuredClone(seed)
  mutate(bad)
  assert.throws(() => parseStore(JSON.stringify(bad)))
}
assert.throws(() => parseStore('{bad'))
assert.throws(() => parseStore('null'))
let stored = JSON.stringify(seed)
const storage = {
  getItem: () => stored,
  setItem: (_key: string, raw: string) => {
    stored = raw
  },
}
const snapshot = stored
stored = JSON.stringify({
  ...seed,
  raffles: seed.raffles.map((r, i) =>
    i === 0 ? { ...r, name: 'Cambio otra pestaña' } : r,
  ),
})
assert.throws(
  () => saveSnapshot(storage, 'demo', seed, snapshot),
  /Otra pestaña/,
)
assert.equal(JSON.parse(stored).raffles[0].name, 'Cambio otra pestaña')
const saved = saveSnapshot(storage, 'demo', seed, stored)
assert.equal(stored, saved)
console.log(
  'PASS: legacy migration, safe image sources, IDs, unique/ranged tickets, occupancy conflicts, malformed storage, stale-write protection',
)
