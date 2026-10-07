import type { Order, Store } from '../../raffles/model'

export function dateKey(value: string | number) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
export function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value.length === 10 ? value + 'T18:00:00Z' : value))
}
const sum = (orders: Order[]) =>
  orders.reduce(
    (total, o) => total + Math.round(o.price * 100) * o.tickets.length,
    0,
  ) / 100
export function finance(store: Store, id = 'all') {
  const raffles = store.raffles.filter((r) => id === 'all' || r.id === id),
    ids = new Set(raffles.map((r) => r.id))
  const orders = store.orders.filter((o) => ids.has(o.raffleId))
  const paid = orders.filter((o) => o.status === 'paid'),
    pending = orders.filter((o) => o.status === 'pending')
  const collected = sum(paid),
    fees = paid.reduce((total, o) => total + Math.round(o.fee * 100), 0) / 100,
    prize =
      raffles.reduce((total, r) => total + Math.round(r.cost * 100), 0) / 100,
    expenses =
      raffles.reduce((total, r) => total + Math.round(r.expenses * 100), 0) /
      100
  return {
    collected,
    fees,
    prize,
    expenses,
    profit: Math.round((collected - fees - prize - expenses) * 100) / 100,
    pending: sum(pending),
    pendingCount: pending.length,
    paidCount: paid.length,
    sold: paid.reduce((total, o) => total + o.tickets.length, 0),
    reserved: pending.reduce((total, o) => total + o.tickets.length, 0),
    paid,
    orders,
  }
}
export function dailyRevenue(orders: Order[], today: string) {
  const days = Array.from({ length: 14 }, (_, i) => ({
    date: dateKey(new Date(today).getTime() - (13 - i) * 86400000),
    value: 0,
  }))
  const map = new Map(days.map((d) => [d.date, d]))
  for (const o of orders) {
    const d = map.get(dateKey(o.date))
    if (d && o.status === 'paid')
      d.value = Math.round((d.value + o.price * o.tickets.length) * 100) / 100
  }
  return days
}
