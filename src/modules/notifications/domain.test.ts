import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { retryDelay } from '../../lib/storage/retry'

test('storage retries remain independent of retired notifications', () => {
  assert.equal(retryDelay(1), 30000)
  assert.equal(retryDelay(8), 3600000)
  const source = readFileSync(
    new URL('../../lib/storage/recovery-repository.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(source, /notifications/)
})
test('notification runtime entrypoints have no exports or server functions', () => {
  for (const file of [
    'server',
    'delivery',
    'worker',
    'repository',
    'domain',
    'jobs',
    'schemas',
  ]) {
    assert.equal(existsSync(new URL(`./${file}.ts`, import.meta.url)), false)
  }
})
