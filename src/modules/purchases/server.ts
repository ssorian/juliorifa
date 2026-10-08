import { createServerFn } from '@tanstack/react-start'
import { idInput, pageInput, adminListInput } from '../raffles/schemas/backend'
import { reserveInput, reviewInput, reservationKeyInput } from './schemas'
import { safe } from './repository'
import * as service from './services'
import * as proof from './proof-services'

export const lookupOwnReservationByKey = createServerFn({ method: 'GET' })
  .inputValidator(reservationKeyInput)
  .handler(({ data }) =>
    safe(() => service.lookupOwnReservationByKey(data.idempotencyKey)),
  )
export const createReservation = createServerFn({ method: 'POST' })
  .inputValidator(reserveInput)
  .handler(({ data }) => safe(() => service.reserve(data)))
export const ownPurchases = createServerFn({ method: 'GET' })
  .inputValidator(pageInput)
  .handler(({ data }) => safe(() => service.list(data.offset, data.limit)))
export const ownPurchase = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => service.detail(data.id)))
export const cancelReservation = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => service.cancel(data.id)))
export const cancelAdminReservation = createServerFn({ method: 'POST' })
  .inputValidator(reviewInput)
  .handler(({ data }) => safe(() => service.adminCancel(data.id, data.reason)))
export const adminPurchases = createServerFn({ method: 'GET' })
  .inputValidator(adminListInput)
  .handler(({ data }) =>
    safe(() => service.list(data.offset, data.limit, true, data)),
  )
export const adminPurchase = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => service.detail(data.id, true)))
export const approvePurchase = createServerFn({ method: 'POST' })
  .inputValidator(reviewInput)
  .handler(({ data }) => safe(() => proof.review(data.id, 'paid', data.reason)))
export const rejectPurchase = createServerFn({ method: 'POST' })
  .inputValidator(reviewInput)
  .handler(({ data }) =>
    safe(() => proof.review(data.id, 'rejected', data.reason)),
  )
export const purchaseAudit = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => proof.auditEvents(data.id)))
