import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { limits, readBoundedBody, validateFile } from './validation'
import { createStorage } from './supabase'
import { proofSelectionError } from '../../modules/purchases/lib/proof-selection'
import { ProofUpload } from '../../modules/purchases/components/ProofUpload'

const max = 4 * 1024 * 1024
function pdf(size: number) {
  const bytes = Buffer.alloc(size, 32)
  bytes.write('%PDF-1.7\n')
  bytes.write('%%EOF\n', size - 6)
  return bytes
}

test('new proofs accept exactly 4 MiB and reject one byte more on client and server', async () => {
  assert.equal(limits.proof, max)
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']) {
    assert.equal(proofSelectionError({ type, size: max }), null)
    assert.equal(proofSelectionError({ type, size: max + 1 }), 'Selecciona PNG, JPEG, WebP o PDF, máximo 4 MiB.')
  }
  assert.equal(proofSelectionError({ type: 'text/html', size: 1 }), 'Selecciona PNG, JPEG, WebP o PDF, máximo 4 MiB.')
  const accepted = await validateFile(pdf(max), 'application/pdf', 'proof')
  assert.equal(accepted.sizeBytes, max)
  assert.equal(accepted.mime, 'application/pdf')
  await assert.rejects(validateFile(pdf(max + 1), 'application/pdf', 'proof'), /FILE_TOO_LARGE/)
  const body = new Request('https://fixture.invalid', { method: 'POST', body: pdf(max) })
  assert.equal((await readBoundedBody(body, limits.proof)).length, max)
  const oversized = new Request('https://fixture.invalid', { method: 'POST', body: pdf(max + 1) })
  await assert.rejects(readBoundedBody(oversized, limits.proof), /FILE_TOO_LARGE/)
  assert.match(renderToStaticMarkup(createElement(ProofUpload, { busy: false, onSend: async () => true })), /máximo 4 MiB/)
})

test('image admission stays at 2 MiB and existing larger private proofs remain readable', async () => {
  assert.equal(limits.image, 2 * 1024 * 1024)
  await assert.rejects(validateFile(Buffer.alloc(limits.image + 1), 'image/png', 'image'), /FILE_TOO_LARGE/)
  const bytes = pdf(5 * 1024 * 1024)
  let downloads = 0
  const store = createStorage({ url: 'https://fixture.invalid', bucket: 'private', secretKey: 'fixture' }, {
    async upload() { throw new Error('must not upload') },
    async remove() { throw new Error('must not remove') },
    async createSignedUrl() { throw new Error('must not sign proof URLs') },
    async download() { downloads++; return { data: new Blob([bytes], { type: 'application/pdf' }), error: null } },
  })
  const result = await store.download('proofs/70b7cb24-97e4-4fbe-b56f-f16e0540f7e5', 'application/pdf', bytes.length)
  assert.deepEqual(result.bytes, bytes)
  assert.equal(result.mime, 'application/pdf')
  assert.equal(downloads, 1)
})
