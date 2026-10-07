import { numberState } from '../model'
import type { Raffle, Store } from '../model'

export function parseNumbers(value: string, r: Raffle) {
  const result = new Set<number>()
  const tokens = value.trim().split(',')
  if (!value.trim()) throw new Error('Escribe al menos un número o rango.')
  if (tokens.length > 1000)
    throw new Error('Consulta como máximo 1,000 números.')
  for (const token of tokens) {
    const match = token.trim().match(/^(\d{1,6})(?:\s*-\s*(\d{1,6}))?$/)
    if (!match)
      throw new Error(
        'Usa números separados por comas o un rango como 2000-2010.',
      )
    const from = Number(match[1]),
      to = match[2] ? Number(match[2]) : from
    if (from > to || from < r.start || to >= r.start + r.quantity)
      throw new Error(
        `Elige números entre ${r.start} y ${r.start + r.quantity - 1}.`,
      )
    if (to - from + 1 > 1000)
      throw new Error('Consulta como máximo 1,000 números.')
    for (let n = from; n <= to; n++) result.add(n)
    if (result.size > 1000)
      throw new Error('Consulta como máximo 1,000 números.')
  }
  return [...result].sort((a, b) => a - b)
}
export function adjustAvailability(
  store: Store,
  r: Raffle,
  input: string,
  block: boolean,
) {
  const numbers = parseNumbers(input, r)
  if (
    block &&
    numbers.some((n) => ['sold', 'reserved'].includes(numberState(store, r, n)))
  )
    throw new Error(
      'La consulta incluye boletos vendidos o reservados. Ningún número fue modificado.',
    )
  const blocked = new Set(r.blocked)
  if (!numbers.some((n) => (block ? !blocked.has(n) : blocked.has(n)))) {
    throw new Error(
      block
        ? 'Esos números ya están bloqueados.'
        : 'La consulta no contiene boletos bloqueados.',
    )
  }
  for (const n of numbers)
    if (block) blocked.add(n)
    else blocked.delete(n)
  return {
    ...store,
    raffles: store.raffles.map((x) =>
      x.id === r.id ? { ...x, blocked: [...blocked].sort((a, b) => a - b) } : x,
    ),
  }
}
export function inventoryCsv(store: Store, r: Raffle) {
  const width = Math.max(4, String(r.start + r.quantity - 1).length)
  const states = new Map<number, string>(r.blocked.map((n) => [n, 'blocked']))
  for (const order of store.orders)
    if (order.raffleId === r.id && order.status !== 'cancelled')
      for (const n of order.tickets)
        states.set(n, order.status === 'paid' ? 'sold' : 'reserved')
  return (
    'numero,estado\r\n' +
    Array.from(
      { length: r.quantity },
      (_, i) =>
        `${String(i + r.start).padStart(width, '0')},${states.get(i + r.start) || 'available'}`,
    ).join('\r\n')
  )
}
export function validImageSource(image: string) {
  return (
    /^\/images\/raffles\/[\w-]+\.webp$/.test(image) ||
    (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image) &&
      image.length <= 3 * 1024 * 1024)
  )
}
export function validateRaffle(input: Raffle, store: Store, existing?: Raffle) {
  const r = {
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
  }
  if (
    !r.name ||
    r.name.length > 80 ||
    !r.description ||
    r.description.length > 1000
  )
    throw new Error('Nombre (hasta 80) y descripción (hasta 1,000) requeridos.')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
    !Number.isFinite(Date.parse(r.date + 'T18:00:00Z')) ||
    new Date(r.date + 'T18:00:00Z').toISOString().slice(0, 10) !== r.date
  )
    throw new Error('Elige una fecha válida.')
  if (!['active', 'scheduled', 'paused', 'draft'].includes(r.status))
    throw new Error('Selecciona un estado válido.')
  if (
    !Number.isInteger(r.quantity) ||
    r.quantity < 10 ||
    r.quantity > 100000 ||
    !Number.isInteger(r.start) ||
    r.start < 0 ||
    r.start + r.quantity - 1 > 999999
  )
    throw new Error('Configura de 10 a 100,000 boletos entre 0 y 999999.')
  if (!Number.isFinite(r.price) || r.price < 0.01 || r.price > 100000)
    throw new Error('Precio inválido.')
  if (
    [r.price, r.cost, r.expenses].some(
      (n) =>
        !Number.isFinite(n) ||
        n < 0 ||
        n > 10000000 ||
        Math.abs(n * 100 - Math.round(n * 100)) > 0.000001,
    )
  )
    throw new Error('Los importes deben ser positivos con hasta dos decimales.')
  if (
    r.features.length > 12 ||
    r.features.some(
      (f) =>
        f[0].length > 50 ||
        f[1].length > 100 ||
        Boolean(f[0].trim()) !== Boolean(f[1].trim()),
    )
  )
    throw new Error(
      'Completa nombre y valor de cada característica (máximo 12).',
    )
  if (!validImageSource(r.image))
    throw new Error('Selecciona o sube una imagen PNG, JPG o WebP válida.')
  if (existing) {
    const occupied = store.orders
      .filter((o) => o.raffleId === existing.id && o.status !== 'cancelled')
      .flatMap((o) => o.tickets)
    if (occupied.length && r.start !== existing.start)
      throw new Error(
        'No puedes cambiar la numeración inicial cuando ya hay compras.',
      )
    if (
      [
        ...store.orders
          .filter((o) => o.raffleId === existing.id)
          .flatMap((o) => o.tickets),
        ...existing.blocked,
      ].some((n) => n < r.start || n >= r.start + r.quantity)
    )
      throw new Error(
        'El rango dejaría fuera boletos vendidos, reservados o bloqueados.',
      )
  }
  return {
    ...r,
    features: r.features
      .filter((f) => f[0].trim())
      .map((f) => [f[0].trim(), f[1].trim()] as [string, string]),
  }
}
