import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint, run, parseExecution } from './verify-postgres'
import { assertEventTriggerPolicy, dispatchExecution, stageMessage } from '../tests/postgres/policy'
import { readFile, readdir } from 'node:fs/promises'
import { isolatedConnection, isolatedMigration, schemaIdentifier } from '../tests/postgres/safety'
import { installIsolation } from '../tests/postgres/isolation'
import { context } from '../tests/postgres/context'

test('PLAN/help and invalid flags never load environment, DB or storage', async () => {
  let loads = 0, mutations = 0
  const messages: string[] = []
  const deps = { load: async () => { loads++; return { url: 'postgres://fixture@localhost/db', execute: async () => { mutations++ } } }, out: (s: string) => messages.push(s) }
  assert.equal(await run([], deps), 0)
  assert.match(messages.pop()!, /PLAN/)
  assert.equal(await run(['--help'], deps), 0)
  for (const args of [['--execute'], ['--execute-isolated'], ['--target-fingerprint', 'a'.repeat(16)], ['--help', '--execute-isolated'], ['--execute-isolated', '--target-fingerprint', 'F'.repeat(16)], ['--execute-isolated', '--target-fingerprint', 'a'.repeat(16), '--unknown'], ['--execute-isolated', '--execute-isolated', '--target-fingerprint', 'a'.repeat(16)]]) {
    assert.equal(await run(args, deps), 1)
  }
  assert.equal(loads, 0)
  assert.equal(mutations, 0)
})

test('fingerprint matches canonical host:port/path, ignoring credentials and query', () => {
  assert.equal(fingerprint('postgres://one:secret@localhost/db?sslmode=require'), fingerprint('postgres://two:other@localhost:5432/db'))
  assert.notEqual(fingerprint('postgres://localhost/db'), fingerprint('postgres://localhost/other'))
})

test('runtime target mismatch never executes and errors are fixed, without secret detail', async () => {
  let executions = 0
  const out: string[] = []
  assert.equal(await run(['--execute-isolated', '--target-fingerprint', 'f7fb7a27f69664ff'], { load: async () => ({ url: 'postgres://fixture@localhost/db', execute: async () => { executions++ } }), out: s => out.push(s) }), 1)
  assert.equal(executions, 0)
  assert.deepEqual(out, ['ERROR: PostgreSQL verification refused or failed.'])
  assert.equal(await run(['--execute-isolated', '--target-fingerprint', 'f7fb7a27f69664ff'], { load: async () => { throw new Error('secret') }, out: s => out.push(s) }), 1)
  assert.ok(out.every(s => !s.includes('secret')))
})

test('reviewed migrations are scoped; arbitrary schemas and unsafe DDL fail closed', async () => {
  const name = 'juliorifa_verify_' + 'a'.repeat(32)
  assert.throws(() => schemaIdentifier('public'))
  assert.throws(() => isolatedConnection('postgres://localhost/db?host=elsewhere', name))
  assert.throws(() => isolatedConnection('postgres://localhost/db?service=elsewhere', name))
  const isolated = isolatedConnection('postgres://localhost/db?options=-c%20search_path%3Dpublic', name)
  assert.equal(new URL(isolated.url).searchParams.get('options'), isolated.options)
  assert.ok(!isolated.options.includes('public'))
  assert.throws(() => isolatedMigration('SET search_path=public;', name))
  assert.throws(() => isolatedMigration('CREATE TABLE "x" (id int REFERENCES "other"."user"(id));', name))
  const directory = new URL('../drizzle/', import.meta.url)
  const files = (await readdir(directory)).filter(n => /^000[0-8]_.*\.sql$/.test(n))
  assert.equal(files.length, 9)
  for (const file of files) assert.ok(!isolatedMigration(await readFile(new URL(file, directory), 'utf8'), name).includes('"public".'))
})

test('Node hook injects only fixture DB/actor into real reserve without loading production DB', async () => {
  const hook = installIsolation()
  try {
    const { reserve } = await import('../src/modules/purchases/services')
    let calls = 0
    const database = { transaction: async () => { calls++; throw new Error('FIXTURE_TRANSACTION') } } as unknown as Parameters<typeof context.run>[0]['database']
    await assert.rejects(context.run({ database, actor: { id: 'fixture', role: 'client' } }, () => reserve({ raffleId: 'fixture', tickets: [0], idempotencyKey: 'fixture' })), /FIXTURE_TRANSACTION/)
    assert.equal(calls, 1)
    await assert.rejects(reserve({ raffleId: 'fixture', tickets: [0], idempotencyKey: 'fixture' }), /ISOLATION_CONTEXT_REQUIRED/)
  } finally { hook.deregister() }
})

test('event trigger opt-in requires complete exact authorization before loading', async () => {
  const base = ['--execute-isolated', '--target-fingerprint', 'f7fb7a27f69664ff']
  const exception = ['--allow-development-event-triggers', '--expected-event-triggers', '6']
  let loads = 0
  for (const args of [exception, [...base.slice(1), ...exception], ['--execute-isolated', ...exception], [...base, exception[0]], [...base, '--expected-event-triggers', '6'], [...base, ...exception, ...exception], ...['0', '5', '7', '06', '6.0', '-6'].map(count => [...base, exception[0], exception[1], count])]) {
    assert.equal(await run(args, { load: async () => { loads++; throw new Error('private') }, out: () => {} }), 1)
  }
  assert.equal(loads, 0)
  const options = parseExecution([...base, ...exception])
  assert.deepEqual(options, { allowDevelopmentEventTriggers: true, expectedEventTriggers: 6 })
  let received: unknown
  await dispatchExecution(async (_url, configuration) => { received = configuration }, 'fixture', options, () => {})
  assert.deepEqual(received, options)
  assert.deepEqual(parseExecution(base), { allowDevelopmentEventTriggers: false, expectedEventTriggers: 0 })
})

test('event trigger records reject drift and default remains zero-only; stages are allowlisted', () => {
  const normal = { allowDevelopmentEventTriggers: false, expectedEventTriggers: 0 }
  const approved = { allowDevelopmentEventTriggers: true, expectedEventTriggers: 6 }
  assert.doesNotThrow(() => assertEventTriggerPolicy([{ count: 0 }], normal))
  assert.doesNotThrow(() => assertEventTriggerPolicy([{ count: 6 }], approved))
  for (const rows of [[], [{ count: 6 }, { count: 6 }], [{ count: '6' }], ...[0, 5, 7, -1].map(count => [{ count }])]) assert.throws(() => assertEventTriggerPolicy(rows, approved))
  assert.throws(() => assertEventTriggerPolicy([{ count: 6 }], normal))
  assert.throws(() => assertEventTriggerPolicy([{ count: 5 }], { ...approved, expectedEventTriggers: 5 }))
  assert.equal(stageMessage('event-trigger-policy'), 'STAGE: event-trigger-policy')
  assert.equal(stageMessage('postgres://private'), null)
  assert.equal(stageMessage('failed:postgres://private'), null)
  assert.equal(stageMessage('failed:event-trigger-policy'), 'ERROR: PostgreSQL stage failed: event-trigger-policy')
})

test('only the independently approved target is accepted', async () => {
  let loads = 0
  assert.equal(await run(['--execute-isolated', '--target-fingerprint', fingerprint('postgres://localhost/db')], { load: async () => { loads++; throw new Error() }, out: () => {} }), 1)
  assert.equal(loads, 0)
})
