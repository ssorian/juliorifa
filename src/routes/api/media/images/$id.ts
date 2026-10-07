import { createFileRoute } from '@tanstack/react-router'
import { mediaResponse } from '#/lib/storage/http'
import { imageURL } from '#/modules/raffles/services/media'

export const Route = createFileRoute('/api/media/images/$id')({
  server: {
    handlers: { GET: ({ params }) => mediaResponse(params.id, imageURL) },
  },
})
