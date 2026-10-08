import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { readBoundedBody, validateFile } from './validation'
import { createStorage, assertObjectKey, boundedStorageFetch } from './supabase'
import { resolveStorageConfig } from './configuration'
import { uploadVerified } from './upload'
import { assertImageAttachment } from '../../modules/raffles/services/media-policy'
import { requireSameOrigin, proofResponse } from './http'

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
test('native SDK operations: UUID keys, upload options, image TTL, proof bytes and idempotent remove', async () => {
  const calls: unknown[] = []
  const store = createStorage(
    { bucket: 'private', url: 'https://example.test', secretKey: 'stub' },
    {
      async upload(key, body, options) {
        calls.push([key, body, options])
        return { data: { path: key, id: 'stub', fullPath: key }, error: null }
      },
      async remove(keys) {
        calls.push(keys)
        return { data: [], error: null }
      },
      async createSignedUrl(key, ttl) {
        calls.push([key, ttl])
        return {
          data: { signedUrl: 'https://signed.test/object' },
          error: null,
        }
      },
      async download(key) {
        calls.push(key)
        return {
          data: new Blob(['x'], { type: 'application/pdf' }),
          error: null,
        }
      },
    },
  )
  const key = 'proofs/70b7cb24-97e4-4fbe-b56f-f16e0540f7e5'
  const image = key.replace('proofs/', 'images/')
  assertObjectKey(key, 'proof')
  assert.throws(() => assertObjectKey('proofs/../secret', 'proof'))
  assert.throws(() => assertObjectKey(key, 'image'))
  await store.put(key, Buffer.from('x'), 'application/pdf')
  assert.deepEqual(calls[0], [
    key,
    Buffer.from('x'),
    { contentType: 'application/pdf', cacheControl: '0', upsert: false },
  ])
  assert.equal(
    await store.url(image, 'image', 'image/png'),
    'https://signed.test/object',
  )
  assert.deepEqual(calls[1], [image, 60])
  await assert.rejects(
    store.url(key, 'proof', 'application/pdf'),
    /INVALID_ASSET/,
  )
  assert.deepEqual(
    (await store.download(key, 'application/pdf', 1)).bytes,
    Buffer.from('x'),
  )
  await assert.rejects(
    store.download(key, 'image/png', 1),
    /STORAGE_UNAVAILABLE/,
  )
  await assert.rejects(
    store.download(key, 'application/pdf', 10 * 1024 * 1024 + 1),
    /INVALID_ASSET/,
  )
  await store.remove(key)
  await store.remove(key)
  assert.deepEqual(calls.at(-1), [key])
})
test('native provider failures never expose messages and malformed keys make no calls', async () => {
  let calls = 0
  const failure = () => {
    calls++
    throw new Error('private-provider-detail')
  }
  const store = createStorage(
    { bucket: 'private', url: 'https://example.test', secretKey: 'stub' },
    {
      upload: failure,
      remove: failure,
      createSignedUrl: failure,
      download: failure,
    },
  )
  const key = 'proofs/70b7cb24-97e4-4fbe-b56f-f16e0540f7e5'
  for (const operation of [
    () => store.put(key, Buffer.from('x'), 'application/pdf'),
    () => store.remove(key),
    () => store.url(key.replace('proofs/', 'images/'), 'image', 'image/png'),
    () => store.download(key, 'application/pdf', 1),
  ]) {
    await assert.rejects(
      operation(),
      (error: Error) => error.message === 'STORAGE_UNAVAILABLE',
    )
  }
  assert.equal(calls, 4)
  await assert.rejects(store.remove('proofs/../secret'), /INVALID_ASSET/)
  assert.equal(calls, 4)
})
test('SDK fetch bounds content length and streamed bytes before blob allocation; disallows redirects/origin escape', async () => {
  let cancelled = 0
  const response = (length?: string) =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(10 * 1024 * 1024))
          c.enqueue(new Uint8Array(1))
        },
        cancel() {
          cancelled++
        },
      }),
      { headers: length ? { 'content-length': length } : {} },
    )
  const bounded = boundedStorageFetch(
    'https://example.test',
    async (_input, init) => {
      assert.equal(init?.redirect, 'error')
      assert.ok(init.signal)
      return response()
    },
  )
  await assert.rejects(
    (await bounded('https://example.test/storage/v1/object')).blob(),
    /STORAGE_UNAVAILABLE/,
  )
  assert.equal(cancelled, 1)
  await assert.rejects(
    bounded('https://other.test/object'),
    /STORAGE_UNAVAILABLE/,
  )
  const byLength = boundedStorageFetch('https://example.test', async () =>
    response(String(10 * 1024 * 1024 + 1)),
  )
  await assert.rejects(
    byLength('https://example.test/object'),
    /STORAGE_UNAVAILABLE/,
  )
  assert.equal(cancelled, 2)
  const small = boundedStorageFetch(
    'https://example.test',
    async () => new Response('ok'),
  )
  assert.equal(await (await small('https://example.test/object')).text(), 'ok')
})
test('proof HTTP response attaches validated MIME with private headers and sanitized failure', async () => {
  const id = '70b7cb24-97e4-4fbe-b56f-f16e0540f7e5'
  const response = await proofResponse(id, async () => ({
    bytes: Buffer.from('pdf'),
    mime: 'application/pdf',
  }))
  assert.equal(response.status, 200)
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="receipt.pdf"',
  )
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('location'), null)
  assert.equal(await response.text(), 'pdf')
  const error = await proofResponse(id, async () => {
    throw new Error('provider secret')
  })
  assert.equal(error.status, 503)
  assert.equal((await error.json()).error, 'BACKEND_UNAVAILABLE')
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
    async download() {
      return { bytes: Buffer.alloc(0), mime: 'application/pdf' }
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
test('native config is lazy, validates URL and bucket, and prefers secret key', () => {
  assert.throws(() => resolveStorageConfig({}), /STORAGE_NOT_CONFIGURED/)
  const env = {
    SUPABASE_URL: 'https://example.test',
    SUPABASE_STORAGE_BUCKET: 'private',
    SUPABASE_SECRET_KEY: 'secret',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy',
  }
  assert.equal(resolveStorageConfig(env).secretKey, 'secret')
  assert.equal(
    resolveStorageConfig({ ...env, SUPABASE_SECRET_KEY: undefined }).secretKey,
    'legacy',
  )
  for (const url of [
    'http://example.test',
    'https://user@example.test',
    'https://example.test/?x=1',
    'https://example.test/#x',
  ])
    assert.throws(
      () => resolveStorageConfig({ ...env, SUPABASE_URL: url }),
      /STORAGE_NOT_CONFIGURED/,
    )
  for (const bucket of ['../private', 'a/b', 'a\nb'])
    assert.throws(
      () => resolveStorageConfig({ ...env, SUPABASE_STORAGE_BUCKET: bucket }),
      /STORAGE_NOT_CONFIGURED/,
    )
})
