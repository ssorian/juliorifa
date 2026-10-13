import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proofSelectionError } from './proof-selection'

test('selection accepts supported nonempty files within 4 MiB only', () => {
  for (const type of [
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
  ])
    assert.equal(proofSelectionError({ type, size: 4 * 1024 * 1024 }), null)
  for (const file of [
    { type: 'text/html', size: 1 },
    { type: 'image/png', size: 0 },
    { type: 'application/pdf', size: 4 * 1024 * 1024 + 1 },
  ])
    assert.ok(proofSelectionError(file))
})
