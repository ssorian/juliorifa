import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { state, signature, validSignature } from './state'
import { sendEmail } from './email'
import { createStorage } from './storage'
import type { StorageConfig } from '../../src/lib/storage/configuration'

after(async () => {
  await state.ready
  await state.pg.close()
})
test('fixture applies all checked-in SQL only to the memory database', async () => {
  await state.ready
  const result = await state.pg.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM "user"',
  )
  assert.equal(result.rows[0].count, 0)
})
test('notification capture dedupes keyed outbox delivery, not unkeyed messages', async () => {
  const message = {
    to: 'fixture@fixture.invalid',
    subject: 'Fixture',
    text: 'Fixture',
  }
  const before = state.messages.length
  await sendEmail({ ...message, idempotencyKey: 'fixture/event' })
  await sendEmail({ ...message, idempotencyKey: 'fixture/event' })
  await sendEmail(message)
  await sendEmail(message)
  assert.equal(state.messages.length - before, 3)
})
test('fixture image URLs authenticate all parameters; proofs download bytes without bearer URLs', async () => {
  const storage = createStorage({} as StorageConfig)
  const proofKey = 'proofs/12345678-1234-4123-8123-123456789abc'
  const key = 'images/12345678-1234-4123-8123-123456789abc'
  const bytes = Buffer.from('%PDF-1.4\n%%EOF\n')
  await storage.put(key, bytes, 'application/pdf')
  await storage.put(proofKey, bytes, 'application/pdf')
  assert.deepEqual(
    (await storage.download(proofKey, 'application/pdf', bytes.length)).bytes,
    bytes,
  )
  await assert.rejects(
    storage.url(proofKey, 'proof', 'application/pdf'),
    /INVALID_ASSET/,
  )
  const url = new URL(await storage.url(key, 'image', 'application/pdf'))
  assert.equal(url.origin, 'http://127.0.0.1:3212')
  const expires = Number(url.searchParams.get('expires'))
  assert.ok(expires > Date.now() && expires <= Date.now() + 60000)
  const sig = url.searchParams.get('signature')!
  url.searchParams.delete('signature')
  assert.ok(validSignature(url.searchParams.toString(), sig))
  assert.ok(!validSignature(url.searchParams.toString() + '&other=1', sig))
  assert.ok(!validSignature('fixture', 'short'))
  assert.equal(signature('fixture').length, 64)
  assert.deepEqual(state.objects.get(key)?.bytes, bytes)
  await storage.remove(key)
  assert.ok(!state.objects.has(key))
  await assert.rejects(
    storage.put('proofs/../../outside', bytes, 'application/pdf'),
  )
})
