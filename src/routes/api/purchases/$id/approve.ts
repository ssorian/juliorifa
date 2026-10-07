import { createFileRoute } from '@tanstack/react-router'
import { reviewResponse } from '#/modules/purchases/http'

export const Route = createFileRoute('/api/purchases/$id/approve')({
  server: {
    handlers: {
      POST: ({ request, params }) => reviewResponse(request, params.id, 'paid'),
    },
  },
})
