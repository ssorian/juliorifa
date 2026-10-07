import { images } from './assets'

export type Raffle = {
  id: string
  name: string
  description: string
  image: string
  price: number
  quantity: number
  start: number
  date: string
  status: string
  blocked: number[]
  cost: number
  expenses: number
  features: [string, string][]
}
export type Order = {
  id: string
  raffleId: string
  buyer: string
  tickets: number[]
  price: number
  status: string
  date: string
  method: string
  fee: number
  email: string
}
export type Store = { raffles: Raffle[]; orders: Order[] }
export const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    n,
  )
export const seed: Store = {
  raffles: [
    'iPhone 16 Pro Max',
    'Samsung Galaxy S25 Ultra',
    'ASUS ROG Phone 9',
  ].map((name, i) => ({
    id: ['iphone', 'galaxy', 'rog'][i],
    name,
    description: [
      'Titanio del desierto · 256 GB · A18 Pro · Pantalla 6.9″',
      '256 GB · Cámara 200 MP · S Pen · RAM 12 GB',
      '512 GB · Snapdragon 8 Elite · Batería 5,800 mAh',
    ][i],
    image: Object.values(images)[i],
    price: i === 0 ? 25 : 20,
    quantity: 10000,
    start: 0,
    date: new Date(Date.now() + (24 + i * 7) * 86400000)
      .toISOString()
      .slice(0, 10),
    status: 'active',
    blocked: [9000, 9001],
    cost: 25000,
    expenses: 1500,
    features:
      i === 0
        ? [
            ['Almacenamiento', '256 GB'],
            ['Pantalla', '6.9″ Super Retina XDR'],
            ['Procesador', 'A18 Pro'],
            ['Acabado', 'Titanio del desierto'],
          ]
        : i === 1
          ? [
              ['Almacenamiento', '256 GB'],
              ['Pantalla', '6.9″ Dynamic AMOLED 2X'],
              ['Cámara', '200 MP'],
              ['RAM', '12 GB'],
            ]
          : [
              ['Almacenamiento', '512 GB'],
              ['Pantalla', '6.78″ AMOLED'],
              ['Procesador', 'Snapdragon 8 Elite'],
              ['Batería', '5,800 mAh'],
            ],
  })),
  orders: Array.from({ length: 24 }, (_, i) => ({
    id: `NV-${1060 - i}`,
    raffleId: ['iphone', 'galaxy', 'rog'][i % 3],
    buyer: ['Ana López', 'Carlos Mendoza', 'Sofía García'][i % 3],
    tickets: Array.from(
      { length: 20 },
      (_unused, j) => Math.floor(i / 3) * 20 + j,
    ),
    price: i % 3 === 0 ? 25 : 20,
    status: i % 7 === 0 ? 'pending' : 'paid',
    date: new Date(Date.now() - Math.floor(i / 2) * 86400000).toISOString(),
    method: i % 3 === 0 ? 'Tarjeta' : 'Transferencia',
    fee: i % 3 === 0 ? 14.5 : 0,
    email: `participante.${i + 1}@example.com`,
  })),
}
export function numberState(store: Store, r: Raffle, n: number) {
  if (!Number.isInteger(n) || n < r.start || n >= r.start + r.quantity)
    return 'outside'
  const order = store.orders.find(
    (o) =>
      o.raffleId === r.id && o.status !== 'cancelled' && o.tickets.includes(n),
  )
  return order
    ? order.status === 'paid'
      ? 'sold'
      : 'reserved'
    : r.blocked.includes(n)
      ? 'blocked'
      : 'available'
}
export function shuffled(numbers: number[], random = Math.random) {
  const result = [...numbers]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function available(store: Store, r: Raffle) {
  const occupied = new Set(r.blocked)
  for (const order of store.orders) {
    if (order.raffleId === r.id && order.status !== 'cancelled') {
      for (const number of order.tickets) occupied.add(number)
    }
  }
  return Array.from({ length: r.quantity }, (_, i) => i + r.start).filter(
    (n) => !occupied.has(n),
  )
}
