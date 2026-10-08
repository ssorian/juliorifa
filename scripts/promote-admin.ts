import { config } from 'dotenv'

config({ path: ['.env.local', '.env'], quiet: true })
const args = process.argv.slice(2)
if (
  args.length !== 3 ||
  args[0] !== '--email' ||
  args[2] !== '--confirm-promote'
) {
  console.error(
    'Usage: node --import tsx scripts/promote-admin.ts --email existing@example.com --confirm-promote',
  )
  process.exitCode = 1
} else {
  try {
    const { promoteExistingAdmin } =
      await import('../src/modules/auth/services/promote-admin')
    const { db } = await import('../src/db')
    try {
      await promoteExistingAdmin(args[1], true)
      console.info('Existing account promoted. No new account created.')
    } finally {
      await db.$client.end()
    }
  } catch {
    console.error(
      'Promotion failed: verify configuration and existing credential account.',
    )
    process.exitCode = 1
  }
}
