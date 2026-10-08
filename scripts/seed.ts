import { pathToFileURL } from 'node:url'

export async function runSeed(
  args: Array<string>,
  environment: string | undefined,
  execute: () => Promise<'created' | 'existing'>,
): Promise<string> {
  if (environment !== 'development' && environment !== 'test')
    throw new Error('Seed requires development/test environment')
  if (args.length && (args.length !== 1 || args[0] !== '--execute'))
    throw new Error('Usage: npm run db:seed -- --execute')
  if (!args.length)
    return 'Plan: create development client if absent; reject collisions. No database loaded.'
  return `Development client: ${await execute()}.`
}

async function executeSeed() {
  const { Pool } = await import('pg')
  const { seedClient } =
    await import('../src/modules/auth/services/seed-client')
  if (!process.env.DATABASE_URL)
    throw new Error('Database configuration required')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    return await seedClient({
      async transaction(work) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const result = await work(client)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      },
    })
  } finally {
    await pool.end()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    // Environment configuration is loaded only for explicit execution after initial guards.
    const args = process.argv.slice(2)
    const initialEnvironment = process.env.NODE_ENV ?? 'development'
    await runSeed(args, initialEnvironment, async () => {
      const { config } = await import('dotenv')
      config({ path: ['.env.local', '.env'], quiet: true })
      const environment = process.env.NODE_ENV ?? initialEnvironment
      if (environment !== 'development' && environment !== 'test')
        throw new Error('Seed requires development/test environment')
      return executeSeed()
    }).then(console.info)
  } catch {
    console.error(
      'Seed refused or failed. Use development/test and --execute; verify configuration and identity collisions.',
    )
    process.exitCode = 1
  }
}
