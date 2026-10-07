import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../../../drizzle/0001_thankful_wong.sql', import.meta.url),
  'utf8',
)
test('additive migration preserves baseline auth/todos/data', () => {
  assert.doesNotMatch(
    sql,
    /\b(?:DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX)|TRUNCATE\s|DELETE\s+FROM)\b/i,
  )
  assert.doesNotMatch(
    sql,
    /(?:ALTER|CREATE) TABLE "(?:user|session|account|verification|todos)"/i,
  )
})
test('block 2 migration adds assets/snapshot, changes only money CHECK, never drops data/auth', () => {
  const next = readFileSync(
    new URL('../../../drizzle/0002_big_the_fallen.sql', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    next,
    /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX)|TRUNCATE\s|DELETE\s+FROM|UPDATE\s+"purchases")\b/i,
  )
  assert.doesNotMatch(
    next,
    /(?:ALTER|CREATE) TABLE "(?:user|session|account|verification|todos)"/i,
  )
  assert.deepEqual(next.match(/DROP CONSTRAINT "[^"]+"/g), [
    'DROP CONSTRAINT "purchase_money_valid"',
  ])
  assert.match(next, /ADD COLUMN "payment_snapshot" jsonb/)
  assert.match(next, /CREATE TABLE "media_assets"/)
  assert.match(next, /"total_cents"="purchases"\."subtotal_cents"/)
})
test('SQL occupancy uniqueness and scoped idempotency constraints', () => {
  assert.match(sql, /PRIMARY KEY\("raffle_id","ticket_number"\)/)
  assert.match(sql, /UNIQUE\("user_id","idempotency_key"\)/)
  assert.match(sql, /UNIQUE\("raffle_id"\)/)
  assert.match(sql, /UNIQUE\("event","key"\)/)
  assert.match(sql, /CHECK .*awaiting_proof/)
})
test('release deletes only occupancy, never purchases or order ticket history', () => {
  const repository = readFileSync(
    new URL('./repository.ts', import.meta.url),
    'utf8',
  )
  const services = readFileSync(
    new URL('./services.ts', import.meta.url),
    'utf8',
  )
  const workflow = readFileSync(
    new URL('./workflow-repository.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    repository + services + workflow,
    /\.delete\((?:purchases|orderTickets|purchaseEvents)\)/,
  )
  assert.match(repository, /eq\(purchases.status,\s*'awaiting_proof'\)/)
  assert.match(repository, /\.for\('update'\)/)
})
