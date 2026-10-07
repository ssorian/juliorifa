import { createFileRoute } from '@tanstack/react-router'
import { settingsResponse } from '#/modules/purchases/http'

export const Route = createFileRoute('/api/purchases/payment-settings')({
  server: {
    handlers: {
      GET: ({ request }) => settingsResponse(request),
      POST: ({ request }) => settingsResponse(request),
    },
  },
})
