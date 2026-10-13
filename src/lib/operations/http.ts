import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

type Environment = { JOBS_ENABLED?: string; CRON_SECRET?: string }
type Summary = { expire: { expired: number }; storage: { claimed: number; deleted: number; retry: number; stale: number } }
type Code = 'HEALTH_OK' | 'METHOD_NOT_ALLOWED' | 'INVALID_QUERY' | 'MAINTENANCE_DISABLED' | 'MAINTENANCE_UNCONFIGURED' | 'UNAUTHORIZED' | 'MAINTENANCE_OK' | 'MAINTENANCE_FAILED'
type Event = { requestId: string; code: Code; status: number; summary?: Summary }
type Dependencies = {
  env: () => Environment
  loadRunner: () => Promise<{ runJobs: (input: { kind: 'all'; batch: 10 }) => Promise<unknown> }>
  log: (event: Event) => void
}
const defaults: Dependencies = {
  env: () => ({ JOBS_ENABLED: process.env.JOBS_ENABLED, CRON_SECRET: process.env.CRON_SECRET }),
  loadRunner: () => import('../../config/jobs'),
  log: (event) => console.info(JSON.stringify(event)),
}
function response(code: Code, status: number, summary?: Summary) {
  return Response.json({ code, ...summary }, { status, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(status === 405 ? { Allow: 'GET' } : {}),
  } })
}
function invalidRequest(request: Request): [Code, number] | undefined {
  if (request.method !== 'GET') return ['METHOD_NOT_ALLOWED', 405]
  if (new URL(request.url).search) return ['INVALID_QUERY', 400]
}
// Liveness only: deliberately does not inspect environment, DB or providers.
export function healthResponse(request: Request) {
  const invalid = invalidRequest(request)
  return invalid ? response(...invalid) : response('HEALTH_OK', 200)
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) throw new Error('INVALID_SUMMARY')
  return value
}
function summaryOf(value: unknown): Summary {
  const result = value as Summary
  const expire = { expired: count(result.expire.expired) }
  const storage = {
    claimed: count(result.storage.claimed), deleted: count(result.storage.deleted),
    retry: count(result.storage.retry), stale: count(result.storage.stale),
  }
  if (storage.deleted + storage.retry + storage.stale !== storage.claimed) throw new Error('INVALID_SUMMARY')
  return { expire, storage }
}
export async function maintenanceResponse(request: Request, deps: Dependencies = defaults) {
  const requestId = randomUUID()
  const finish = (code: Code, status: number, summary?: Summary) => {
    deps.log({ requestId, code, status, ...(summary ? { summary } : {}) })
    return response(code, status, summary)
  }
  const invalid = invalidRequest(request)
  if (invalid) return finish(...invalid)
  const env = deps.env()
  if (env.JOBS_ENABLED !== 'true') return finish('MAINTENANCE_DISABLED', 503)
  const secret = env.CRON_SECRET
  if (!secret || secret.length > 4096) return finish('MAINTENANCE_UNCONFIGURED', 503)
  const supplied = request.headers.get('authorization') || ''
  // Fixed-size digests avoid length-dependent equality; bound input before hashing.
  const digest = (text: string) => createHash('sha256').update(text).digest()
  if (supplied.length > 4103 || !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`))) return finish('UNAUTHORIZED', 401)
  try {
    const runner = await deps.loadRunner()
    const summary = summaryOf(await runner.runJobs({ kind: 'all', batch: 10 }))
    return finish('MAINTENANCE_OK', 200, summary)
  } catch {
    return finish('MAINTENANCE_FAILED', 500)
  }
}
