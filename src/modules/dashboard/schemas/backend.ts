import { z } from 'zod'

export const metricsInput = z.object({ raffleId: z.uuid().optional() }).strict()
