import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promoteExistingAdmin } from './promote-admin'
import type { PromotionRepository } from './promote-admin'

test('private promotion requires confirmation, existing user and credential', async () => {
  let writes = 0
  let reads = 0
  let record: { id: string; credential: boolean } | undefined
  const repository: PromotionRepository = {
    async find() {
      reads++
      return record
    },
    async promote() {
      writes++
    },
  }
  await assert.rejects(
    promoteExistingAdmin('fixture@example.com', false, repository),
    /confirmation/,
  )
  assert.equal(reads, 0)
  await assert.rejects(
    promoteExistingAdmin('fixture@example.com', true, repository),
    /credential/,
  )
  record = { id: 'existing', credential: false }
  await assert.rejects(
    promoteExistingAdmin('fixture@example.com', true, repository),
    /credential/,
  )
  assert.equal(writes, 0)
  record = { id: 'existing', credential: true }
  await promoteExistingAdmin(' Fixture@example.com ', true, repository)
  assert.equal(writes, 1)
})
