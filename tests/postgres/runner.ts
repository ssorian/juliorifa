import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import { installIsolation } from './isolation'
import { isolatedConnection, isolatedMigration, schemaIdentifier } from './safety'
import { assertEventTriggerPolicy, DEFAULT_OPTIONS } from './policy'
import type { ExecutionOptions, StageReporter } from './policy'

function tool(command: 'pg_dump' | 'pg_restore', args: string[], url: string, options: string, input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const child = spawn(command, args, { env: {
      PATH: process.env.PATH,
      PGHOST: target.hostname.replace(/^\[|\]$/g, ''), PGPORT: target.port || '5432',
      PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
      PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password),
      PGSSLMODE: target.searchParams.get('sslmode') ?? 'prefer',
      PGCHANNELBINDING: target.searchParams.get('channel_binding') ?? 'prefer',
      PGOPTIONS: options, PGCONNECT_TIMEOUT: '10',
    }, stdio: ['pipe', 'pipe', 'pipe'] })
    const buffers: Buffer[] = []
    let size = 0, failed = false
    const timer = setTimeout(() => { failed = true; child.kill('SIGKILL') }, 60000)
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 64 * 1024 * 1024) { failed = true; child.kill('SIGKILL') } else buffers.push(chunk) })
    child.stderr.on('data', () => { /* Never forward libpq diagnostics/secrets. */ })
    child.stdin.on('error', () => { failed = true })
    child.on('error', () => { clearTimeout(timer); reject(new Error('PG_TOOL')) })
    child.on('close', code => { clearTimeout(timer); if (failed || code !== 0) reject(new Error('PG_TOOL')); else resolve(Buffer.concat(buffers)) })
    child.stdin.end(input)
  })
}

export async function execute(value: string, configuration: ExecutionOptions = DEFAULT_OPTIONS, report: StageReporter = () => {}) {
  let stage = 'tools'
  const mark = (next: string) => { stage = next; report(next) }
  mark('tools')
  const name = `juliorifa_verify_${randomUUID().replaceAll('-', '')}`
  const identifier = schemaIdentifier(name), token = randomUUID()
  const { url, options } = isolatedConnection(value, name)
  // Tools are checked before connecting; their output is never exposed.
  await tool('pg_dump', ['--version'], url, options)
  await tool('pg_restore', ['--version'], url, options)
  mark('migration-surface')
  const directory = new URL('../../drizzle/', import.meta.url)
  const names = (await readdir(directory)).filter(n => /^000[0-8]_.*\.sql$/.test(n)).sort()
  assert.equal(names.length, 9)
  const migrations = await Promise.all(names.map(async (file, index) => {
    assert.ok(file.startsWith(String(index).padStart(4, '0') + '_'))
    return isolatedMigration(await readFile(new URL(file, directory), 'utf8'), name)
  }))
  const pool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000 })
  pool.on('error', () => {})
  let owner: PoolClient | undefined, created = false
  let first: PoolClient | undefined, second: PoolClient | undefined
  const hook = installIsolation()
  const owns = async () => {
    const result = await owner!.query('SELECT n.nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owned, obj_description(n.oid, $2) AS token FROM pg_namespace n WHERE n.nspname = $1', [name, 'pg_namespace'])
    return result.rows.length === 1 && result.rows[0].owned === true && result.rows[0].token === token
  }
  const dropOwned = async () => {
    await owner!.query('BEGIN')
    try {
      assert.ok(await owns())
      const tables = await owner!.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [name])
      for (const row of tables.rows) {
        assert.match(row.tablename, /^[a-z_]+$/)
        await owner!.query(`LOCK TABLE ${identifier}."${row.tablename}" IN ACCESS EXCLUSIVE MODE`)
      }
      const external = await owner!.query(`SELECT 1 FROM pg_depend d
        CROSS JOIN LATERAL pg_identify_object(d.refclassid, d.refobjid, d.refobjsubid) referenced
        CROSS JOIN LATERAL pg_identify_object(d.classid, d.objid, d.objsubid) dependent
        LEFT JOIN pg_attrdef ad ON d.classid = 'pg_attrdef'::regclass AND ad.oid = d.objid
        LEFT JOIN pg_rewrite rw ON d.classid = 'pg_rewrite'::regclass AND rw.oid = d.objid
        LEFT JOIN pg_trigger tr ON d.classid = 'pg_trigger'::regclass AND tr.oid = d.objid
        LEFT JOIN pg_constraint co ON d.classid = 'pg_constraint'::regclass AND co.oid = d.objid
        LEFT JOIN pg_class attached ON attached.oid = coalesce(ad.adrelid, rw.ev_class, tr.tgrelid)
        LEFT JOIN pg_namespace ns ON ns.oid = coalesce(attached.relnamespace, co.connamespace)
        WHERE referenced.schema = $1 AND coalesce(dependent.schema, ns.nspname) IS DISTINCT FROM $1
        AND NOT (coalesce(dependent.schema, ns.nspname, '') = 'pg_toast' AND d.deptype = 'i') LIMIT 1`, [name])
      assert.equal(external.rowCount, 0)
      await owner!.query(`DROP SCHEMA ${identifier} CASCADE`)
      await owner!.query('COMMIT')
    } catch { await owner!.query('ROLLBACK'); throw new Error('OWNERSHIP_OR_DEPENDENCY') }
  }
  const snapshot = async () => {
    const tables = await owner!.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [name])
    assert.ok(tables.rows.length > 0)
    const hash = createHash('sha256')
    for (const row of tables.rows) {
      assert.match(row.tablename, /^[a-z_]+$/)
      const data = await owner!.query(`SELECT row_to_json(t)::text AS value FROM ${identifier}."${row.tablename}" t ORDER BY 1`)
      hash.update(JSON.stringify([row.tablename, data.rows]))
    }
    return hash.digest('hex')
  }
  try {
    mark('connect')
    owner = await pool.connect()
    owner.on('error', () => {})
    mark('event-trigger-policy')
    // Explicit development exception accepts only the operator-approved count, never disables triggers.
    const triggers = await owner.query("SELECT count(*)::int AS count FROM pg_event_trigger WHERE evtenabled <> 'D'")
    assertEventTriggerPolicy(triggers.rows, configuration)
    mark('schema-create')
    // This lock is held on the same physical connection until cleanup finishes.
    assert.equal((await owner.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [name])).rows[0].locked, true)
    await owner.query('BEGIN')
    try {
      await owner.query(`CREATE SCHEMA ${identifier}`)
      // Token is locally generated UUID; never user-controlled SQL.
      await owner.query(`COMMENT ON SCHEMA ${identifier} IS '${token}'`)
      await owner.query('COMMIT')
      created = true
    } catch { await owner.query('ROLLBACK'); throw new Error('SCHEMA_CREATE') }
    assert.ok(await owns())
    assert.equal((await owner.query('SELECT current_schema() AS name')).rows[0].name, name)
    mark('migrations')
    await owner.query('BEGIN')
    try { for (const sql of migrations) await owner.query(sql); await owner.query('COMMIT') }
    catch { await owner.query('ROLLBACK'); throw new Error('MIGRATIONS') }
    mark('connections')
    first = await pool.connect()
    second = await pool.connect()
    first.on('error', () => {})
    second.on('error', () => {})
    const identities = await Promise.all([first, second].map(c => c.query('SELECT pg_backend_pid() AS pid, current_schema() AS name')))
    assert.notEqual(identities[0].rows[0].pid, identities[1].rows[0].pid)
    assert.ok(identities.every(r => r.rows[0].name === name))
    mark('scenarios')
    const { scenarios } = await import('./scenarios')
    await scenarios(first, second)
    const closed = [first, second].map(client => new Promise<void>(resolve => {
      client.once('end', resolve)
      client.release(true)
    }))
    first = undefined
    second = undefined
    await Promise.all(closed)
    mark('snapshot')
    const before = await snapshot()
    mark('dump')
    const archive = await tool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--strict-names', `--schema=${name}`], url, options)
    assert.ok(archive.length > 0)
    assert.ok(await owns())
    mark('restore-drop')
    await dropOwned()
    mark('restore')
    // Trusted in-memory archive contains only this exact schema, including ownership token.
    await tool('pg_restore', ['--dbname=', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction'], url, options, archive)
    mark('restore-verify')
    assert.ok(await owns())
    assert.equal(await snapshot(), before)
  } catch {
    report(`failed:${stage}`)
    throw new Error('VERIFICATION_STAGE')
  } finally {
    mark('cleanup')
    first?.release(true)
    second?.release(true)
    try {
      if (created && owner) {
        const exists = await owner.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [name])
        if (exists.rowCount) await dropOwned()
        assert.equal((await owner.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [name])).rowCount, 0)
      }
    } catch {
      report('failed:cleanup')
      throw new Error('CLEANUP')
    } finally {
      owner?.release(true)
      await pool.end()
      hook.deregister()
      mark('closed')
    }
  }
}
