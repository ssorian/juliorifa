import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import * as schema from '../../../db/schema'

test('migration 0008 snapshot matches schema offline and preserves 0007 lineage', async () => {
  const root = new URL('../../../../drizzle/', import.meta.url)
  const previous = JSON.parse(readFileSync(new URL('meta/0007_snapshot.json', root), 'utf8'))
  const snapshot = JSON.parse(readFileSync(new URL('meta/0008_snapshot.json', root), 'utf8'))
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', root), 'utf8'))
  assert.equal(snapshot.prevId, previous.id)
  assert.equal(journal.entries.at(-1).tag, '0008_auth_security')
  assert.deepEqual(await generateMigration(snapshot, generateDrizzleJson(schema, snapshot.id)), [])
  assert.equal(snapshot.tables['public.rate_limit'].columns.last_request.type, 'bigint')
  assert.equal(snapshot.tables['public.two_factor'].columns.verified.default, true)
})
