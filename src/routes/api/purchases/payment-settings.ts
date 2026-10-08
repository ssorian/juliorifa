import { createFileRoute } from '@tanstack/react-router'

// Retired endpoint: no configuration read or write is exposed.
export const Route = createFileRoute('/api/purchases/payment-settings')({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 410 }),
      POST: () => new Response(null, { status: 410 }),
    },
  },
})
