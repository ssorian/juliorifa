import { createFileRoute } from '@tanstack/react-router'
import { cronResponse } from '#/modules/raffles/services/cron-http'

export const Route = createFileRoute('/api/cron/draw')({
  server: { handlers: { GET: () => cronResponse() } },
})
