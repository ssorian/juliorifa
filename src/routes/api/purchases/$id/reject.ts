import { createFileRoute } from '@tanstack/react-router'
import { reviewResponse } from '#/modules/purchases/http'

export const Route = createFileRoute('/api/purchases/$id/reject')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        reviewResponse(request, params.id, 'rejected'),
    },
  },
})
