import { createFileRoute } from '@tanstack/react-router'
import { mediaResponse } from '#/lib/storage/http'
import { proofURL } from '#/modules/purchases/proof-services'

export const Route = createFileRoute('/api/media/proofs/$id')({
  server: {
    handlers: { GET: ({ params }) => mediaResponse(params.id, proofURL) },
  },
})
