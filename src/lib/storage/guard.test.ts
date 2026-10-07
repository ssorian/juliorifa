import test from 'node:test'
import assert from 'node:assert/strict'
import { withUploadGuard } from './guard'
import { DomainError } from '../../modules/purchases/domain'

// Adapter serializes claims; actual durable SQL is additionally exercised in PGlite.
test('parallel same purchase: only winner decodes/PUTs; finally releases own token', async () => {
  let active = false,
    decodes = 0,
    puts = 0,
    released = 0
  const storage = {
    async put() {
      puts++
    },
  }
  const lease = {
    kind: 'proof' as const,
    targetId: 'p',
    ownerId: 'u',
    token: 'token',
    expiresAt: new Date(100),
  }
  const repo = {
    async claim() {
      if (active) throw new DomainError('UPLOAD_BUSY')
      active = true
      return lease
    },
    async owns() {
      return true
    },
    async release() {
      active = false
      released++
    },
  }
  let unblock!: () => void
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  const first = withUploadGuard(repo, 'u', 'p', 'proof', async () => {
    decodes++
    await gate
    await storage.put()
  })
  await new Promise((resolve) => setImmediate(resolve))
  const blocked = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      withUploadGuard(repo, 'u', 'p', 'proof', async () => {
        decodes++
        await storage.put()
      }),
    ),
  )
  assert.equal(
    blocked.every((r) => r.status === 'rejected'),
    true,
  )
  unblock()
  await first
  assert.equal(decodes, 1)
  assert.equal(puts, 1)
  assert.equal(released, 1)
})
