import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { raffleAvailability, suggestedTickets } from '../services/server'

export async function refreshRaffleAvailability<T>(
  client: QueryClient,
  id: string,
  refresh: () => Promise<T>,
): Promise<T> {
  try {
    return await refresh()
  } finally {
    // Revalidate even after a failed refresh. Never copy partial/stale counts
    // into the summary or clear its error state with optimistic data.
    await client.invalidateQueries({
      queryKey: ['public-inventory', id, 'summary'],
      exact: true,
    })
  }
}

export function useRaffleAvailabilityRefresh(id: string) {
  const client = useQueryClient()
  return <T,>(refresh: () => Promise<T>) => refreshRaffleAvailability(client, id, refresh)
}

export function useRaffleAvailability(id: string) {
  return useQuery({
    queryKey: ['public-inventory', id, 'summary'],
    queryFn: () => raffleAvailability({ data: { id } }),
    retry: false,
  })
}

export function useSuggestedTickets(id: string, exclude: number[]) {
  return useQuery({
    queryKey: ['public-inventory', id, 'suggestions', [...exclude].sort((a,b) => a-b)],
    queryFn: () => suggestedTickets({ data: { id, exclude, limit: 8 } }),
    retry: false,
  })
}
