// Offline only: imports schemas, never db/index, dotenv or deployment configuration.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import * as schema from '../../../db/schema'

const root = new URL('../../../../drizzle/', import.meta.url)
const previous = JSON.parse(readFileSync(new URL('meta/0007_snapshot.json', root), 'utf8'))
const next = generateDrizzleJson(schema, previous.id)
const statements = await generateMigration(previous, next)
const sqlPath = new URL('0008_auth_security.sql', root)
const snapshotPath = new URL('meta/0008_snapshot.json', root)
if (existsSync(snapshotPath)) {
  const existing = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  if (existing.prevId !== previous.id) throw new Error('Unexpected 0008 lineage')
  next.id = existing.id
}
const journalPath = new URL('meta/_journal.json', root)
const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
const last = journal.entries.at(-1)
if (last?.idx !== 7 && !(last?.idx === 8 && last.tag === '0008_auth_security')) throw new Error('Unexpected journal head')
writeFileSync(sqlPath, statements.join('\n--> statement-breakpoint\n') + '\n')
writeFileSync(snapshotPath, JSON.stringify(next, null, 2) + '\n')
if (last.idx === 7) journal.entries.push({ idx: 8, version: '7', when: last.when + 1, tag: '0008_auth_security', breakpoints: true })
writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n')
console.log(`Generated migration 0008 offline: ${statements.length} statements`)
