import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import type { PoolClient } from 'pg'
import * as schema from '../../src/db/schema'
import { context } from './context'

export async function scenarios(first: PoolClient, second: PoolClient) {
  const { reserve } = await import('../../src/modules/purchases/services')
  const { createWorkflowRepository } = await import('../../src/modules/purchases/workflow-repository')
  const { finalizeWithRepository, reviewWithRepository } = await import('../../src/modules/purchases/workflow')
  const databases = [drizzle(first, { schema }), drizzle(second, { schema })]
  const database = databases[0]
  await database.insert(schema.user).values([
    { id: 'fixture-one', name: 'Fixture', email: 'one@example.invalid', role: 'client' },
    { id: 'fixture-two', name: 'Fixture', email: 'two@example.invalid', role: 'client' },
    { id: 'fixture-admin', name: 'Fixture', email: 'admin@example.invalid', role: 'admin' },
  ])
  // Complete fictional configuration prevents fallback to real payment environment.
  await database.insert(schema.paymentSettings).values({ id: 1, bank: 'Fixture', beneficiary: 'Fixture', account: '000000', instructions: 'Fixture only', updatedBy: 'fixture-admin' })
  const raffleId = randomUUID()
  await database.insert(schema.raffles).values({ id: raffleId, title: 'Isolated fixture', description: '', status: 'active', startNumber: 0, ticketCount: 10, priceCents: 100, salesDeadline: new Date(Date.now() + 3600000) })
  const keys = [randomUUID(), randomUUID()]
  const actors = ['fixture-one', 'fixture-two']
  const reserveAs = (connection: number, actor: number, ticket: number, key: string) => context.run({ database: databases[connection], actor: { id: actors[actor], role: 'client' } }, () => reserve({ raffleId, tickets: [ticket], idempotencyKey: key }))
  const race = await Promise.allSettled([reserveAs(0, 0, 0, keys[0]), reserveAs(1, 1, 0, keys[1])])
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1)
  const failure = race.find(r => r.status === 'rejected') as PromiseRejectedResult
  assert.equal(failure.reason?.message, 'TICKET_UNAVAILABLE')
  const winner = race.findIndex(r => r.status === 'fulfilled')
  const order = (race[winner] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserve>>>).value
  const retry = await reserveAs(1 - winner, winner, 0, keys[winner])
  assert.equal(retry.id, order.id)
  assert.deepEqual(retry, order)
  await assert.rejects(reserveAs(1 - winner, winner, 1, keys[winner]))
  const sameKey = randomUUID()
  const samePayload = await Promise.all([reserveAs(0, 0, 1, sameKey), reserveAs(1, 0, 1, sameKey)])
  assert.equal(samePayload[0].id, samePayload[1].id)
  assert.equal((await database.select().from(schema.purchases)).length, 2)
  assert.equal((await database.select().from(schema.occupancy)).length, 2)
  const assetId = randomUUID()
  await database.insert(schema.mediaAssets).values({ id: assetId, key: `proofs/${assetId}`, kind: 'proof', purchaseId: order.id, ownerId: actors[winner], status: 'pending', mime: 'application/pdf', sizeBytes: 20, digest: 'a'.repeat(64) })
  const repo = (index: number, actorId: string) => createWorkflowRepository(databases[index], { orderId: order.id, raffleId, actorId, assetId, now: Date.now() })
  await finalizeWithRepository(repo(0, actors[winner]), actors[winner], Date.now)
  await Promise.all([0, 1].map(index => reviewWithRepository(repo(index, 'fixture-admin'), 'admin', 'paid', 'Fixture approval', Date.now)))
  const read = async () => ({ order: await database.select().from(schema.purchases).where(eq(schema.purchases.id, order.id)), audit: await database.select().from(schema.purchaseEvents).where(eq(schema.purchaseEvents.orderId, order.id)) })
  const approved = await read()
  assert.equal(approved.order[0].status, 'paid')
  assert.equal(approved.audit.filter(e => e.type === 'approved').length, 1)
  await reviewWithRepository(repo(1, 'fixture-admin'), 'admin', 'paid', 'Fixture retry', Date.now)
  assert.deepEqual(await read(), approved)
  assert.equal((await database.select().from(schema.occupancy).where(eq(schema.occupancy.orderId, order.id)))[0].state, 'sold')
}
