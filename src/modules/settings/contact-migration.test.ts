import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import * as schema from '../../db/schema'

test('contact migration snapshot matches schema and preserves journal lineage offline', async () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../../../drizzle/meta/${name}`, import.meta.url), 'utf8'))
  const previous = read('0006_snapshot.json')
  const snapshot = read('0007_snapshot.json')
  const journal = read('_journal.json')
  assert.equal(snapshot.prevId, previous.id)
  const entry = journal.entries.find((item: { idx: number }) => item.idx === 7)
  const previousEntry = journal.entries.find((item: { idx: number }) => item.idx === 6)
  assert.equal(entry.tag, '0007_business_contact')
  assert.ok(entry.when > previousEntry.when)
  // Historical snapshots stay immutable; compare current schema to the journal head.
  const head = read(`${String(journal.entries.at(-1).idx).padStart(4, '0')}_snapshot.json`)
  assert.deepEqual(await generateMigration(head, generateDrizzleJson(schema, head.id)), [])
  const statements = await generateMigration(previous, snapshot)
  assert.equal(statements.length, 2)
  assert.ok(statements.every((statement) => statement.includes('business_contact')))
  assert.equal(readFileSync(new URL('../../../drizzle/0007_business_contact.sql', import.meta.url), 'utf8'), statements.join('\n--> statement-breakpoint\n') + '\n')
})
