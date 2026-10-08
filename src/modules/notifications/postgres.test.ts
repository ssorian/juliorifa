import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { testDatabase } from '../purchases/db/testing'
import { notificationOutbox } from './db/schema'

test('retired notification schema preserves historical rows', async () => {
  const fixture = await testDatabase()
  try {
    const id = randomUUID()
    await fixture.database.insert(notificationOutbox).values({
      id,
      event: 'purchase.approved',
      key: id,
      payload: { historical: true },
    })
    const rows = await fixture.database.select().from(notificationOutbox)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].payload, { historical: true })
  } finally {
    await fixture.pg.close()
  }
})
