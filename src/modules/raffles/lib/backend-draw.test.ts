import test from 'node:test'
import assert from 'node:assert/strict'
import { candidateDigest, chooseWinner, assertDrawReady } from '../services/draw-domain'
import { validateTickets } from '../../purchases/domain'
import { raffleInput, ticketsInput, idInput } from '../schemas/backend'

test('start zero, bounds and no client winner/random override',()=>{
  assert.deepEqual(validateTickets([0,2],3,0),[0,2])
  assert.throws(()=>validateTickets([3],3,0))
  assert.equal(ticketsInput.safeParse({raffleId:'70b7cb24-97e4-4fbe-b56f-f16e0540f7e5',tickets:[0]}).success,true)
  assert.equal(idInput.safeParse({id:'70b7cb24-97e4-4fbe-b56f-f16e0540f7e5',winner:0}).success,false)
  const input={title:'R',description:'',status:'draft',ticketCount:3,startNumber:0,priceCents:100,feeBps:0,salesDeadline:'2026-01-01T00:00:00Z',drawAt:'2026-01-02T00:00:00Z',prizeCostCents:10,expensesCents:5,images:[],features:[]}
  assert.equal(raffleInput.safeParse(input).success,true)
  assert.equal(raffleInput.safeParse({...input,drawAt:'2025-01-01T00:00:00Z'}).success,false)
  assert.equal(raffleInput.safeParse({...input,startNumber:2147483647}).success,false)
})
test('draw requires due, closed sales, no unresolved orders and nonzero candidates',()=>{
  assert.throws(()=>assertDrawReady(100,100,99,['paid'],1))
  assert.throws(()=>assertDrawReady(100,100,100,['reviewing'],1))
  assert.throws(()=>assertDrawReady(100,100,100,['awaiting_proof'],1))
  assert.throws(()=>assertDrawReady(100,100,100,['expired'],0))
  assertDrawReady(100,100,100,['paid','expired','rejected'],1)
})
test('ordered digest deterministic, injected random index only for internal tests',()=>{
  const candidates=[{ticketNumber:2,orderId:'b'},{ticketNumber:0,orderId:'a'}]
  assert.equal(candidateDigest(candidates),candidateDigest([...candidates].reverse()))
  assert.notEqual(candidateDigest(candidates),candidateDigest([{ticketNumber:1,orderId:'a'}]))
  assert.equal(chooseWinner(candidates,()=>0).winner.ticketNumber,0)
  assert.equal(chooseWinner(candidates,()=>1).winner.ticketNumber,2)
  assert.throws(()=>chooseWinner(candidates,()=>2))
  assert.throws(()=>chooseWinner([],()=>0))
})
