import { createFileRoute } from '@tanstack/react-router'
import { uploadResponse } from '#/lib/storage/http'
import { uploadProof } from '#/modules/purchases/proof-services'

export const Route = createFileRoute('/api/uploads/proofs/$id')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        uploadResponse(request, params.id, uploadProof),
    },
  },
})
