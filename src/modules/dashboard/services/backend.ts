import { createServerFn } from '@tanstack/react-start'
import { db } from '../../../db'
import { requireAdmin } from '../../auth/services/authorization'
import { safe } from '../../purchases/repository'
import { metricsInput } from '../schemas/backend'
import { finance } from './finance-repository'

export const adminFinancialMetrics = createServerFn({ method: 'GET' })
  .inputValidator(metricsInput)
  .handler(({ data }) =>
    safe(async () => {
      await requireAdmin()
      return finance(db, Date.now(), data.raffleId)
    }),
  )
