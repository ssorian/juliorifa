import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { testDatabase } from '../../purchases/db/testing'
import * as schema from '../../../db/schema'
import { performDraw,publicDrawDTO } from '../services/draw-repository'
import type { DrawDatabase } from '../services/draw-repository'
import { assertNumbering } from './backend-policy'
import { finance } from '../../dashboard/services/finance-repository'
import type { FinanceDatabase } from '../../dashboard/services/finance-repository'

let fixture:Awaited<ReturnType<typeof testDatabase>>
before(async()=>{fixture=await testDatabase()});after(()=>fixture.pg.close())
const database=()=>fixture.database as unknown as DrawDatabase

test('SQL start zero valid, negatives/range/draw date invalid; historical numbering immutable',async()=>{
  const raffle=await fixture.raffle(),order=await fixture.order(raffle.id,'cancelled',[0])
  assert.equal((await fixture.database.select().from(schema.orderTickets).where(eq(schema.orderTickets.orderId,order.id)))[0].ticketNumber,0)
  await assert.rejects(fixture.database.insert(schema.occupancy).values({raffleId:raffle.id,ticketNumber:-1,state:'blocked'}))
  await assert.rejects(fixture.raffle({startNumber:2147483647,ticketCount:2}))
  await assert.rejects(fixture.raffle({drawAt:new Date(99)}))
  assert.throws(()=>assertNumbering(10,10,true,[],0,1))
  assert.throws(()=>assertNumbering(10,9,false,[9],0,0))
})
test('draw paid only, uniform index maps ordered tickets, same/second request returns original',async()=>{
  const raffle=await fixture.raffle(),paid=await fixture.order(raffle.id,'paid',[0,2])
  await fixture.order(raffle.id,'expired',[1]);await fixture.order(raffle.id,'rejected',[3])
  let calls=0
  const run=()=>performDraw(database(),raffle.id,'a',()=>100,max=>{calls++;assert.equal(max,2);return 1})
  const [one,two]=await Promise.all([run(),run()]) // Single PGlite connection, not a two-PG-connection race.
  assert.equal(one.id,two.id);assert.equal(calls,1);assert.equal(one.winnerTicket,2);assert.equal(one.winnerOrderId,paid.id);assert.equal(one.randomIndex,1);assert.equal(one.candidateCount,2)
  const publicResult=publicDrawDTO(one)
  assert.equal('winnerOrderId' in publicResult,false);assert.equal('actorId' in publicResult,false)
  const events=await fixture.database.select().from(schema.notificationOutbox).where(eq(schema.notificationOutbox.key,raffle.id))
  assert.equal(events.length,1)
  await assert.rejects(fixture.database.insert(schema.draws).values({...one,id:randomUUID()}))
})
test('premature/zero/pending refuse; pending refusal commits expiry/closing, no winner/outbox',async()=>{
  const early=await fixture.raffle()
  await fixture.order(early.id,'paid',[0])
  await assert.rejects(performDraw(database(),early.id,'a',()=>99,()=>0),/DRAW_TOO_EARLY/)
  const zero=await fixture.raffle()
  await assert.rejects(performDraw(database(),zero.id,'a',()=>100,()=>0),/NO_CANDIDATES/)
  const pending=await fixture.raffle()
  await fixture.order(pending.id,'paid',[0]);await fixture.order(pending.id,'reviewing',[1]);const overdue=await fixture.order(pending.id,'awaiting_proof',[2],{expiresAt:new Date(100)})
  await assert.rejects(performDraw(database(),pending.id,'a',()=>100,()=>0),/UNRESOLVED_PURCHASES/)
  const [expired]=await fixture.database.select().from(schema.purchases).where(eq(schema.purchases.id,overdue.id))
  assert.equal(expired.status,'expired')
  assert.equal((await fixture.database.select().from(schema.occupancy).where(eq(schema.occupancy.orderId,overdue.id))).length,0)
  assert.equal((await fixture.database.select().from(schema.draws).where(eq(schema.draws.raffleId,pending.id))).length,0)
  assert.equal((await fixture.database.select().from(schema.raffles).where(eq(schema.raffles.id,pending.id)))[0].status,'closed')
  const awaiting=await fixture.raffle();await fixture.order(awaiting.id,'awaiting_proof',[0])
  await assert.rejects(performDraw(database(),awaiting.id,'a',()=>100,()=>0),/UNRESOLVED_PURCHASES/)
})
test('draw transaction rolls winner/status back if outbox insert fails',async()=>{
  const raffle=await fixture.raffle();await fixture.order(raffle.id,'paid',[0])
  await fixture.database.insert(schema.notificationOutbox).values({id:randomUUID(),event:'raffle.winner',key:raffle.id,payload:{}})
  await assert.rejects(performDraw(database(),raffle.id,'a',()=>100,()=>0))
  assert.equal((await fixture.database.select().from(schema.draws).where(eq(schema.draws.raffleId,raffle.id))).length,0)
  assert.equal((await fixture.database.select().from(schema.raffles).where(eq(schema.raffles.id,raffle.id)))[0].status,'active')
})
test('finance repository queries real paid snapshots, reviewing separate, filter and approval timezone',async()=>{
  const raffle=await fixture.raffle();const now=Date.parse('2026-01-15T05:30:00Z')
  await fixture.order(raffle.id,'paid',[0,1],{reviewedAt:new Date('2026-01-15T05:00:00Z')});await fixture.order(raffle.id,'reviewing',[2])
  const result=await finance(fixture.database as unknown as FinanceDatabase,now,raffle.id)
  assert.equal(result.paidCents,200);assert.equal(result.reviewingCents,100);assert.equal(result.feeExpenseCents,10);assert.equal(result.resultCents,-110);assert.equal(result.today.date,'2026-01-14');assert.equal(result.today.tickets,2);assert.equal(result.chart.length,14)
})
