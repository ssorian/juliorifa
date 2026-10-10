export function soldPercentage(snapshot: { sold: number; ticketCount: number }) {
  return Math.floor(snapshot.sold * 100 / snapshot.ticketCount)
}
