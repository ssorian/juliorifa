import { safePurchaseId } from '../../purchases/lib/presentation'

/** Success is not a local cart state: a server reservation and actor are required. */
export function reservationDialog(id: unknown, userId: string | null) {
  return safePurchaseId(id) && userId ? { id, userId } : null
}
