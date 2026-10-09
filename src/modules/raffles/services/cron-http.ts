import '@tanstack/react-start/server-only'
import { timingSafeEqual } from 'node:crypto'

export async function cronResponse(
  request: Request,
  secret: string | undefined,
  run: () => Promise<{ completed: number; deferred: number; failed: number }>,
) {
  const reply = (body: object, status: number) =>
    Response.json(body, {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  if (!secret?.trim()) return reply({ error: 'CRON_NOT_CONFIGURED' }, 503)
  const supplied = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return reply({ error: 'UNAUTHORIZED' }, 401)
  try {
    const counts = await run()
    return reply(counts, counts.failed ? 500 : 200)
  } catch {
    // No SQL errors, identifiers, contacts, credentials or raw exceptions.
    return reply({ error: 'CRON_FAILED' }, 500)
  }
}
