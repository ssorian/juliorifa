export function canConfirmManualDraw(input: {
  status: string
  due: boolean
  busy: boolean
  result: unknown
  readiness?: {
    paidTickets: number
    stock: { reserved: number; reviewing: number }
  }
}) {
  const { status, due, busy, result, readiness } = input
  return !['draft', 'archived'].includes(status) && due && !busy &&
    result === null && !!readiness && readiness.paidTickets > 0 &&
    readiness.stock.reserved === 0 && readiness.stock.reviewing === 0
}
