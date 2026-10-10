import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { testDatabase } from '../../purchases/db/testing'
import { occupancy, purchases } from '../../../db/schema'
import { readAvailability } from './availability'
import { availabilityInput } from '../schemas/backend'
import type { AvailabilityDatabase } from './availability'

test('SQL snapshot counts paid only, expires awaiting but retains reviewing, excludes selected, no PII', async () => {
  const f = await testDatabase()
  try {
    const r = await f.raffle()
    await f.order(r.id, 'paid', [0])
    await f.order(r.id, 'reviewing', [1], { expiresAt: new Date(100) })
    await f.order(r.id, 'awaiting_proof', [2])
    const expired = await f.order(r.id, 'awaiting_proof', [3], { expiresAt: new Date(100) })
    await f.database.insert(occupancy).values({ raffleId: r.id, ticketNumber: 4, state: 'blocked' })
    const result = await readAvailability(f.database as unknown as AvailabilityDatabase, { id: r.id, limit: 8, exclude: [0,5] }, () => 100, () => 0)
    assert.deepEqual(result, { salesOpen: false, ticketCount: 10, available: 6, sold: 1, eligible: 5, suggestions: [] })
    const [order] = await f.database.select().from(purchases).where(eq(purchases.id, expired.id))
    assert.equal(order.status, 'expired')
    await f.database.update((await import('../db/schema')).raffles).set({ salesDeadline: new Date(200), drawAt: new Date(200) }).where(eq((await import('../db/schema')).raffles.id, r.id))
    const open = await readAvailability(f.database as unknown as AvailabilityDatabase, { id: r.id, limit: 8, exclude: [0,5] }, () => 100, () => 0)
    assert.deepEqual([...open.suggestions].sort((a,b) => a-b), [3,6,7,8,9])
    assert.equal(new Set(open.suggestions).size, 5)
    assert.deepEqual(Object.keys(open).sort(), ['available','eligible','salesOpen','sold','suggestions','ticketCount'])
  } finally { await f.pg.close() }
})

test('SQL samples the global range, zero/nonzero start, empty and million-ticket bound', async () => {
  const f = await testDatabase()
  try {
    for (const startNumber of [0, 100]) {
      const r = await f.raffle({ startNumber, ticketCount: 1000000, salesDeadline: new Date(200), drawAt: new Date(200) })
      const result = await readAvailability(f.database as unknown as AvailabilityDatabase, { id: r.id, limit: 1000, exclude: [startNumber] }, () => 100, (max) => max - 1)
      assert.equal(result.available, 1000000)
      assert.equal(result.eligible, 999999)
      assert.equal(result.suggestions.length, 1000)
      assert.equal(new Set(result.suggestions).size, 1000)
      assert.ok(result.suggestions.every(n => n > startNumber + 1000 && n < startNumber + 1000000))
    }
    const beyondPage = await f.raffle({ ticketCount:1010, salesDeadline:new Date(200), drawAt:new Date(200) })
    await f.database.insert(occupancy).values(Array.from({length:1000}, (_,ticketNumber) => ({ raffleId:beyondPage.id, ticketNumber, state:'blocked' as const })))
    const global = await readAvailability(f.database as unknown as AvailabilityDatabase, {id:beyondPage.id}, () => 100)
    assert.equal(global.suggestions.length, 8)
    assert.ok(global.suggestions.every(n => n >= 1000 && n < 1010))
    assert.equal(global.available, 10)
    const r = await f.raffle({ ticketCount: 1, salesDeadline: new Date(200), drawAt: new Date(200) })
    assert.deepEqual((await readAvailability(f.database as unknown as AvailabilityDatabase, { id:r.id, limit:8, exclude:[] }, () => 100)).suggestions, [0])
    await f.database.insert(occupancy).values({ raffleId:r.id, ticketNumber:0, state:'blocked' })
    assert.deepEqual((await readAvailability(f.database as unknown as AvailabilityDatabase, { id:r.id, limit:8, exclude:[] }, () => 100)).suggestions, [])
    await assert.rejects(readAvailability(f.database as unknown as AvailabilityDatabase, { id:r.id, limit:8, exclude:[1] }, () => 100), /INVALID/)
  } finally { await f.pg.close() }
})

test('strict availability limits reject duplicates, PII and oversized requests', () => {
  const id = '00000000-0000-4000-8000-000000000000'
  assert.equal(availabilityInput.parse({id}).limit, 8)
  for (const extra of [{limit:1001}, {limit:0}, {exclude:[0,0]}, {exclude:[-1]}, {exclude:Array.from({length:1001},(_,i)=>i)}, {userId:'u'}])
    assert.equal(availabilityInput.safeParse({id,...extra}).success, false)
})
