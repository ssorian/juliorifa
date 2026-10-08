import { createFileRoute } from '@tanstack/react-router'
import { proofResponse } from '#/lib/storage/http'
import { proofDownload } from '#/modules/purchases/proof-services'

export const Route = createFileRoute('/api/media/proofs/$id')({
  server: {
    handlers: { GET: ({ params }) => proofResponse(params.id, proofDownload) },
  },
})
