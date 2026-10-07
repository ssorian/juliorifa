import { DomainError } from '../../purchases/domain'

interface Costs {
  id: string
  prizeCostCents: number
  expensesCents: number
}
interface Order {
  raffleId: string
  status: string
  subtotalCents: number
  feeCents: number
  ticketCount: number
  reviewedAt: Date | null
}
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const day = (date: Date) => formatter.format(date)
function sum(a: number, b: number) {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    !Number.isSafeInteger(a + b)
  )
    throw new DomainError('MONEY_OVERFLOW')
  return a + b
}
export function computeFinance(
  raffles: Costs[],
  orders: Order[],
  now: number,
  raffleId?: string,
) {
  const today = day(new Date(now)),
    anchor = new Date(`${today}T00:00:00Z`)
  const chart = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(anchor)
    date.setUTCDate(date.getUTCDate() - 13 + i)
    return {
      date: date.toISOString().slice(0, 10),
      paidCents: 0,
      feeCents: 0,
      orders: 0,
      tickets: 0,
    }
  })
  let paidCents = 0,
    reviewingCents = 0,
    feeExpenseCents = 0,
    paidOrders = 0,
    paidTickets = 0,
    unknownApprovalCount = 0,
    prizeCostCents = 0,
    expensesCents = 0
  for (const raffle of raffles.filter((r) => !raffleId || r.id === raffleId)) {
    prizeCostCents = sum(prizeCostCents, raffle.prizeCostCents)
    expensesCents = sum(expensesCents, raffle.expensesCents)
  }
  for (const order of orders.filter(
    (o) => !raffleId || o.raffleId === raffleId,
  )) {
    if (order.status === 'reviewing') {
      reviewingCents = sum(reviewingCents, order.subtotalCents)
      continue
    }
    if (order.status !== 'paid') continue
    paidCents = sum(paidCents, order.subtotalCents)
    feeExpenseCents = sum(feeExpenseCents, order.feeCents)
    paidOrders++
    paidTickets = sum(paidTickets, order.ticketCount)
    if (!order.reviewedAt) {
      unknownApprovalCount++
      continue
    }
    if (order.reviewedAt.getTime() > now) continue
    const row = chart.find((c) => c.date === day(order.reviewedAt!))
    if (row) {
      row.paidCents = sum(row.paidCents, order.subtotalCents)
      row.feeCents = sum(row.feeCents, order.feeCents)
      row.orders++
      row.tickets = sum(row.tickets, order.ticketCount)
    }
  }
  return {
    paidCents,
    reviewingCents,
    feeExpenseCents,
    prizeCostCents,
    expensesCents,
    resultCents: sum(
      sum(sum(paidCents, -feeExpenseCents), -prizeCostCents),
      -expensesCents,
    ),
    paidOrders,
    paidTickets,
    unknownApprovalCount,
    chart,
    today: chart[13],
    timeZone: 'America/Mexico_City' as const,
  }
}
