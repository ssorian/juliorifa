type SalesRead = { isSuccess: boolean; data?: { salesOpen: boolean } }
type AvailabilityRead = SalesRead & { data?: { salesOpen: boolean; available: number } }

/** Only successful server reads can establish a terminal sales notice. */
export function salesState(
  availability: AvailabilityRead,
  ...reads: SalesRead[]
): 'closed' | 'sold-out' | null {
  if ([availability, ...reads].some(read => read.isSuccess && read.data?.salesOpen === false)) return 'closed'
  if (availability.isSuccess && availability.data?.available === 0) return 'sold-out'
  return null
}
