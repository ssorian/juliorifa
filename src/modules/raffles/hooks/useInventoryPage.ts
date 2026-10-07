import { useQuery } from '@tanstack/react-query'
import { availableInventory } from '../services/server'

export function useInventoryPage(id: string, from: number) {
  return useQuery({
    queryKey: ['public-inventory', id, from],
    queryFn: () => availableInventory({ data: { id, from, limit: 100 } }),
    retry: false,
  })
}
// Requests only the bounded pages containing the intent, not an entire raffle.
export async function validateIntent(
  id: string,
  picks: number[],
  start: number,
  count: number,
) {
  const pages = [
    ...new Set(
      picks
        .filter((n) => n >= start && n < start + count)
        .map((n) => start + Math.floor((n - start) / 1000) * 1000),
    ),
  ]
  const available = new Set<number>()
  let open = true
  for (const from of pages) {
    const page = await availableInventory({ data: { id, from, limit: 1000 } })
    open = open && page.salesOpen
    page.tickets.forEach((t) => {
      if (t.state === 'available') available.add(t.number)
    })
  }
  return { available, open }
}
