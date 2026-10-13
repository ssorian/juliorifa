import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { DEFAULT_OPTIONS, dispatchExecution, stageMessage } from '../tests/postgres/policy'
import type { ExecutionOptions, Executor } from '../tests/postgres/policy'

const APPROVED = 'f7fb7a27f69664ff'
const HELP = `PLAN: PostgreSQL verification; no environment, DB, files or Storage loaded.
Usage: node --import tsx scripts/verify-postgres.ts [--help]
       node --import tsx scripts/verify-postgres.ts --execute-isolated --target-fingerprint ${APPROVED}
Optional operator-authorized exception (requires both flags above):
       --allow-development-event-triggers --expected-event-triggers 6
Default requires zero active event triggers. Exception requires exactly six;
drift fails closed. Triggers stay enabled and may affect metadata outside the
owned schema. This is not a guarantee that public remains untouched by triggers.
Execution requires the independently approved development/testing destination.
Fingerprint: SHA-256(hostname + ':' + (port || '5432') + pathname), first 16 hex.
Creates only a random owned schema, applies 0000..0008 there, exercises real
reservation/workflow services with test-only DB/actor injection, then dumps and
restores fictional data using pg_dump/pg_restore. No HTTP Auth/Storage evidence.
Requires Node >=22.15, PostgreSQL CREATE schema permission and compatible PG tools.
No public migration/journal, seed, deployment, secrets or customer identifiers logged.
See docs/tasks/postgres-verification.md for isolation and cleanup limitations.`

export function fingerprint(value: string): string {
  const target = new URL(value)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('TARGET')
  return createHash('sha256').update(`${target.hostname}:${target.port || '5432'}${target.pathname}`).digest('hex').slice(0, 16)
}

export function parseExecution(args: string[]): ExecutionOptions {
  const flags = new Map<string, string | true>()
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (flags.has(flag)) throw new Error('FLAGS')
    if (flag === '--execute-isolated' || flag === '--allow-development-event-triggers') flags.set(flag, true)
    else if (flag === '--target-fingerprint' || flag === '--expected-event-triggers') {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error('FLAGS')
      flags.set(flag, value)
    } else throw new Error('FLAGS')
  }
  if (flags.get('--execute-isolated') !== true || flags.get('--target-fingerprint') !== APPROVED) throw new Error('FLAGS')
  const allow = flags.has('--allow-development-event-triggers')
  if (allow ? flags.get('--expected-event-triggers') !== '6' : flags.has('--expected-event-triggers')) throw new Error('FLAGS')
  return allow ? { allowDevelopmentEventTriggers: true, expectedEventTriggers: 6 } : { ...DEFAULT_OPTIONS }
}

type Loaded = { url: string; execute: Executor }
type Dependencies = { load: () => Promise<Loaded>; out: (message: string) => void }

export async function run(args: string[], dependencies: Dependencies): Promise<number> {
  try {
    if (!args.length || (args.length === 1 && args[0] === '--help')) {
      dependencies.out(HELP)
      return 0
    }
    const options = parseExecution(args)
    const loaded = await dependencies.load()
    if (fingerprint(loaded.url) !== APPROVED) throw new Error('TARGET')
    await dispatchExecution(loaded.execute, loaded.url, options, stage => {
      const message = stageMessage(stage)
      if (message) dependencies.out(message)
    })
    dependencies.out('PASS: isolated PostgreSQL reservation, idempotency, approval and restore; cleanup complete.')
    return 0
  } catch {
    dependencies.out('ERROR: PostgreSQL verification refused or failed.')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2), {
    out: message => { (message.startsWith('ERROR:') ? process.stderr : process.stdout).write(`${message}\n`) },
    load: async () => {
      const { config } = await import('dotenv')
      config({ path: ['.env.local', '.env'], quiet: true })
      const url = process.env.DATABASE_URL
      if (!url) throw new Error('CONFIG')
      return { url, execute: async (value, options, report) => { const { execute } = await import('../tests/postgres/runner'); await execute(value, options, report) } }
    },
  })
}
