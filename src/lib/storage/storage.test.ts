import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { readBoundedBody, validateFile } from './validation'
import { createStorage, assertObjectKey } from './s3'
import { resolveStorageConfig } from './configuration'
import { uploadVerified } from './upload'
import { assertImageAttachment } from '../../modules/raffles/services/media-policy'
import { requireSameOrigin } from './http'

test('bounded stream rejects oversize before buffering full request and cancels', async () => {
  let cancelled = false
  const request = new Request('http://localhost', {
    method: 'POST',
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(5))
        c.enqueue(new Uint8Array(5))
      },
      cancel() {
        cancelled = true
      },
    }),
    duplex: 'half',
  } as RequestInit)
  await assert.rejects(readBoundedBody(request, 6), /FILE_TOO_LARGE/)
  assert.equal(cancelled, true)
})
test('MIME/signatures, raster decoding, bytes limits and private PDF only', async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer()
  assert.equal(
    (await validateFile(png, 'image/png', 'image')).mime,
    'image/png',
  )
  await assert.rejects(validateFile(png, 'image/jpeg', 'image'), /INVALID_FILE/)
  await assert.rejects(
    validateFile(Buffer.from('<svg/>'), 'image/svg+xml', 'image'),
    /INVALID_FILE/,
  )
  await assert.rejects(
    validateFile(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png', 'image'),
    /FILE_TOO_LARGE/,
  )
  await assert.rejects(
    validateFile(
      Buffer.alloc(10 * 1024 * 1024 + 1),
      'application/pdf',
      'proof',
    ),
    /FILE_TOO_LARGE/,
  )
  await assert.rejects(
    validateFile(Buffer.from('%PDF-1.7\n%%EOF'), 'application/pdf', 'image'),
    /INVALID_FILE/,
  )
  assert.equal(
    (
      await validateFile(
        Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
        'application/pdf',
        'proof',
      )
    ).mime,
    'application/pdf',
  )
  await assert.rejects(
    validateFile(Buffer.from('%PDF-1.7'), 'application/pdf', 'proof'),
    /INVALID_FILE/,
  )
})
test('raster pixel cap enforced using decoder', async () => {
  const image = await sharp({
    create: { width: 7000, height: 6000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer()
  await assert.rejects(
    validateFile(image, 'image/png', 'image'),
    /INVALID_FILE/,
  )
})
test('keys fixed UUID prefixes; SDK stub receives private attachment GET TTL 60', async () => {
  const commands: unknown[] = []
  let ttl = 0
  const store = createStorage(
    {
      bucket: 'private',
      region: 'x',
      endpoint: 'https://example.test',
      accessKeyId: 'stub',
      secretAccessKey: 'stub',
    },
    async (cmd) => {
      commands.push(cmd)
      return {}
    },
    async (_client, cmd, options) => {
      commands.push(cmd)
      ttl = options.expiresIn
      return 'https://signed.test/object'
    },
  )
  const key = 'proofs/70b7cb24-97e4-4fbe-b56f-f16e0540f7e5'
  assertObjectKey(key, 'proof')
  assert.throws(() => assertObjectKey('proofs/../secret', 'proof'))
  assert.throws(() => assertObjectKey(key, 'image'))
  await store.put(key, Buffer.from('x'), 'application/pdf')
  assert.equal(
    await store.url(key, 'proof', 'application/pdf'),
    'https://signed.test/object',
  )
  assert.equal(ttl, 60)
  const get = commands.at(-1) as {
    input: { ResponseContentDisposition: string; ResponseCacheControl: string }
  }
  assert.match(get.input.ResponseContentDisposition, /attachment/)
  assert.equal(get.input.ResponseCacheControl, 'private, no-store')
})
test('expired upload removes uncommitted object; cleanup failure remains durable, no false success', async () => {
  const calls: string[] = []
  const store = {
    async put() {
      calls.push('put')
    },
    async remove() {
      calls.push('delete')
    },
    async url() {
      return ''
    },
  }
  await assert.rejects(
    uploadVerified(store, 'proofs/id', Buffer.from('x'), 'application/pdf', {
      async persistPending() {
        calls.push('pending')
      },
      async finalize() {
        calls.push('expired-committed')
        return false
      },
      async claimOrphan() {
        calls.push('orphan')
        return true
      },
      async markDeleted() {
        calls.push('deleted')
      },
    }),
    /RESERVATION_EXPIRED/,
  )
  assert.deepEqual(calls, [
    'pending',
    'put',
    'expired-committed',
    'orphan',
    'delete',
    'deleted',
  ])
  calls.length = 0
  await assert.rejects(
    uploadVerified(store, 'proofs/id', Buffer.from('x'), 'application/pdf', {
      async persistPending() {},
      async finalize() {
        throw new Error('uncertain commit')
      },
      async claimOrphan() {
        return false
      },
      async markDeleted() {
        throw new Error('must not delete verified')
      },
    }),
    /uncertain commit/,
  )
  assert.deepEqual(calls, ['put'])
})
test('even admin cannot attach proof, arbitrary key or another owner asset as public image', () => {
  const asset = {
    kind: 'image',
    key: 'images/70b7cb24-97e4-4fbe-b56f-f16e0540f7e5',
    status: 'verified',
    ownerId: 'a',
    raffleId: 'r',
    purchaseId: null,
    verifiedAt: new Date(0),
  }
  assertImageAttachment(asset, 'r', 'a')
  for (const invalid of [
    { ...asset, kind: 'proof' },
    { ...asset, key: 'proofs/70b7cb24-97e4-4fbe-b56f-f16e0540f7e5' },
    { ...asset, ownerId: 'other' },
    { ...asset, status: 'pending' },
    { ...asset, purchaseId: 'purchase' },
    { ...asset, key: 'images/../x' },
  ])
    assert.throws(() => assertImageAttachment(invalid, 'r', 'a'))
})
test('cookie uploads require same-origin POST, no cross-site forgery', () => {
  assert.throws(() =>
    requireSameOrigin(
      new Request('https://app.test/api', {
        headers: { origin: 'https://attacker.test' },
      }),
    ),
  )
  requireSameOrigin(
    new Request('https://app.test/api', {
      headers: { origin: 'https://app.test', 'sec-fetch-site': 'same-origin' },
    }),
  )
})
test('missing storage configuration is explicit and does not prevent import/build', () => {
  assert.throws(() => resolveStorageConfig({}), /STORAGE_NOT_CONFIGURED/)
})
