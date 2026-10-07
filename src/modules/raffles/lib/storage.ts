import { z } from 'zod'
import { seed } from '../model'
import { validImageSource } from './management'
import type { Store } from '../model'

const integer = z.number().int().nonnegative()
const money = z
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001)
const specs = z
  .array(
    z.tuple([
      z.string().trim().min(1).max(50),
      z.string().trim().min(1).max(100),
    ]),
  )
  .max(12)
const schema = z.object({
  raffles: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(1000),
        image: z.string().refine(validImageSource),
        price: money.refine((n) => n > 0 && n <= 100000),
        quantity: integer.min(10).max(100000),
        start: integer.max(999999),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(
            (s) =>
              Number.isFinite(Date.parse(s + 'T18:00:00Z')) &&
              new Date(s + 'T18:00:00Z').toISOString().slice(0, 10) === s,
          ),
        status: z.enum(['active', 'scheduled', 'paused', 'draft']),
        blocked: z.array(integer).max(100000),
        cost: money,
        expenses: money,
        features: specs.optional(),
      }),
    )
    .max(100),
  orders: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        raffleId: z.string(),
        buyer: z.string().min(1).max(100),
        tickets: z.array(integer).min(1).max(100000),
        price: money.refine((n) => n > 0),
        status: z.enum(['paid', 'pending', 'cancelled']),
        date: z
          .string()
          .refine((s) => Number.isFinite(Date.parse(s)))
          .optional(),
        method: z.enum(['Tarjeta', 'Transferencia']).optional(),
        fee: money.optional(),
        email: z.string().email().optional(),
      }),
    )
    .max(1000),
})
export function saveSnapshot(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  next: Store,
  expected: string | null,
) {
  const raw = JSON.stringify(parseStore(JSON.stringify(next)))
  if (storage.getItem(key) !== expected)
    throw new Error('Otra pestaña modificó los datos. No se sobrescribieron.')
  storage.setItem(key, raw)
  return raw
}

export function parseStore(raw: string): Store {
  if (raw.length > 20 * 1024 * 1024)
    throw new Error('Datos locales demasiado grandes.')
  const input = schema.parse(JSON.parse(raw))
  const raffles = input.raffles.map((r) => ({
    ...r,
    features:
      r.features ?? seed.raffles.find((x) => x.id === r.id)?.features ?? [],
  }))
  const orders = input.orders.map((o) => ({
    ...o,
    date: o.date ?? '2026-07-01T18:00:00Z',
    method: o.method ?? 'Transferencia',
    fee: o.fee ?? 0,
    email: o.email ?? 'demo@example.com',
  }))
  if (
    new Set(raffles.map((r) => r.id)).size !== raffles.length ||
    new Set(orders.map((o) => o.id)).size !== orders.length
  )
    throw new Error('Identificadores duplicados.')
  for (const r of raffles) {
    if (
      r.start + r.quantity - 1 > 999999 ||
      new Set(r.blocked).size !== r.blocked.length ||
      r.blocked.some((n) => n < r.start || n >= r.start + r.quantity)
    )
      throw new Error('Inventario inválido.')
    const occupied = new Set(r.blocked)
    for (const o of orders.filter((x) => x.raffleId === r.id)) {
      if (
        new Set(o.tickets).size !== o.tickets.length ||
        o.tickets.some((n) => n < r.start || n >= r.start + r.quantity)
      )
        throw new Error('Boletos inválidos.')
      if (o.status !== 'cancelled')
        for (const n of o.tickets) {
          if (occupied.has(n))
            throw new Error('Boletos ocupados más de una vez.')
          occupied.add(n)
        }
    }
  }
  if (orders.some((o) => !raffles.some((r) => r.id === o.raffleId)))
    throw new Error('Compra sin rifa.')
  return { raffles, orders }
}
