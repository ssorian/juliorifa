import { createFileRoute } from '@tanstack/react-router'

const handle = async ({ request }: { request: Request }) => {
  const { maintenanceResponse } = await import('#/lib/operations/http')
  return maintenanceResponse(request)
}
export const Route = createFileRoute('/api/cron/maintenance')({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle, OPTIONS: handle, HEAD: handle } },
})
