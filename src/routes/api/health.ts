import { createFileRoute } from '@tanstack/react-router'

const handle = async ({ request }: { request: Request }) => {
  const { healthResponse } = await import('#/lib/operations/http')
  return healthResponse(request)
}
export const Route = createFileRoute('/api/health')({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle, OPTIONS: handle, HEAD: handle } },
})
