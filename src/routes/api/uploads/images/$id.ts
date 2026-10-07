import { createFileRoute } from '@tanstack/react-router'
import { uploadResponse } from '#/lib/storage/http'
import { uploadImage } from '#/modules/raffles/services/media'

export const Route = createFileRoute('/api/uploads/images/$id')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        uploadResponse(request, params.id, uploadImage),
    },
  },
})
