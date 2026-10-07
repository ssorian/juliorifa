import { z } from 'zod'

export const jobsInput = z
  .object({
    kind: z.enum(['expire', 'outbox', 'storage', 'all']).default('all'),
    batch: z.int().min(1).max(25).default(10),
  })
  .strict()
