import '@tanstack/react-start/server-only'

/** Compatibility only: no authorization can reactivate automatic draws. */
export async function cronResponse(
  _request?: Request,
  _secret?: string,
  _run?: () => Promise<unknown>,
) {
  return Response.json({ error: 'AUTOMATIC_DRAW_DISABLED' }, {
    status: 410,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
