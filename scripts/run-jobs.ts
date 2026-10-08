import '@tanstack/react-start/server-only'
import { pathToFileURL } from 'node:url'
import { jobsInput, requireJobsEnabled } from '../src/config/jobs'
import { DomainError } from '../src/modules/purchases/domain'

export function parseJobArguments(args: string[]) {
  let kind: string | undefined,
    batch = 10,
    execute = false,
    help = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (['--expire', '--storage', '--all'].includes(arg)) {
      if (kind) throw new DomainError('INVALID_JOB_ARGUMENTS')
      kind = arg.slice(2)
    } else if (arg === '--batch') {
      batch = Number(args[++i])
    } else if (arg === '--confirm-jobs' || arg === '--execute') execute = true
    else if (arg === '--help') help = true
    else throw new DomainError('INVALID_JOB_ARGUMENTS')
  }
  if (help)
    return {
      help: true,
      execute: false,
      input: { kind: 'all' as const, batch: 10 },
    }
  const parsed = jobsInput.safeParse({ kind, batch })
  if (!kind || !parsed.success) throw new DomainError('INVALID_JOB_ARGUMENTS')
  return { help: false, execute, input: parsed.data }
}
export async function executeConfirmedJobs(
  args: string[],
  load: () => Promise<
    (input: ReturnType<typeof parseJobArguments>['input']) => Promise<unknown>
  >,
) {
  const options = parseJobArguments(args)
  if (options.help) return
  if (!options.execute) throw new DomainError('JOBS_EXECUTION_NOT_CONFIRMED')
  requireJobsEnabled()
  return (await load())(options.input)
}
async function main() {
  try {
    const options = parseJobArguments(process.argv.slice(2))
    if (options.help) {
      console.log(
        'run-jobs.ts --expire|--storage|--all --batch 1..25 --confirm-jobs (alias --execute; JOBS_ENABLED=true required)',
      )
      return
    }
    const result = await executeConfirmedJobs(
      process.argv.slice(2),
      async () => {
        const { runJobs } = await import('../src/config/jobs')
        const { db } = await import('../src/db')
        return async (input) => {
          try {
            return await runJobs(input)
          } finally {
            await db.$client.end()
          }
        }
      },
    )
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(error instanceof DomainError ? error.code : 'JOBS_FAILED')
    process.exitCode = 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main()
