import test from 'node:test'
import assert from 'node:assert/strict'
import { assertRole, isPublic, assertBlockable, assertNumbering } from './backend-policy'
import { validateTickets, DomainError } from '../../purchases/domain'
import { reserveInput } from '../../purchases/schemas'

test('anonymous, wrong-role deny; current server role required',()=>{
  assert.throws(()=>assertRole(null,'admin'))
  assert.throws(()=>assertRole({id:'u',role:'client'},'admin'))
  assert.throws(()=>assertRole({id:'u',role:'admin'},'client'))
  assert.equal(assertRole({id:'u',role:'admin'},'admin').id,'u')
})
test('draft and archived never public',()=>{
  assert.equal(isPublic('draft'),false)
  assert.equal(isPublic('archived'),false)
  assert.equal(isPublic('active'),true)
})
test('blocking never changes sold/reviewing/reserved and numbering preserves history',()=>{
  for(const state of ['sold','reviewing','reserved']) assert.throws(()=>assertBlockable([state]))
  assertBlockable(['blocked'])
  assert.throws(()=>assertNumbering(10,9,true,[]))
  assert.throws(()=>assertNumbering(10,9,false,[10]))
  assertNumbering(10,10,true,[10])
})
test('validators reject forged user, money, duplicate selection checked by domain',()=>{
  const input = {raffleId:'70b7cb24-97e4-4fbe-b56f-f16e0540f7e5',tickets:[1],idempotencyKey:'request_123'}
  assert.equal(reserveInput.safeParse(input).success,true)
  assert.equal(reserveInput.safeParse({...input,userId:'other'}).success,false)
  assert.equal(reserveInput.safeParse({...input,totalCents:0}).success,false)
  assert.throws(()=>validateTickets([1,1],10))
})
test('serialized repository double: same ticket concurrent attempts one succeeds; bulk is atomic',async()=>{
  const occupied = new Set<number>()
  let tail = Promise.resolve()
  const reserve = (selection:number[]) => {
    const operation = tail.then(()=>{
      const tickets = validateTickets(selection,10)
      if(tickets.some(n=>occupied.has(n))) throw new DomainError('TICKET_UNAVAILABLE')
      tickets.forEach(n=>occupied.add(n))
    })
    tail = operation.catch(()=>{})
    return operation
  }
  const result = await Promise.allSettled([reserve([1]),reserve([1,2])])
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1)
  assert.deepEqual([...occupied],[1])
})
