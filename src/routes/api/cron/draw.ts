import { createFileRoute } from '@tanstack/react-router'
import { cronResponse } from '#/modules/raffles/services/cron-http'

export const Route = createFileRoute('/api/cron/draw')({
  server: {
    handlers: {
      GET: ({ request }) =>
        cronResponse(request, process.env.CRON_SECRET, async () => {
          // Authenticate before importing configuration/DB or doing any work.
          const [{ db }, { runAutomaticDraws }] = await Promise.all([
            import('#/db'),
            import('#/modules/raffles/services/automatic-draw'),
          ])
          return runAutomaticDraws(db)
        }),
    },
  },
})
