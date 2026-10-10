import { useRef } from 'react'
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
  const batch = useRef({ id, exclude: [...exclude] })
  if (batch.current.id !== id) batch.current = { id, exclude: [...exclude] }
  const query = useQuery({
    queryKey: ['public-inventory', id, 'suggestions'],
    queryFn: () => suggestedTickets({ data: { id, exclude: batch.current.exclude, limit: 8 } }),
    retry: false,
  })
  return {
    ...query,
    refresh: () => {
      // Only an explicit refresh snapshots the current selection. Updating a
      // ref before refetch avoids a second request for the previous batch.
      batch.current = { id, exclude: [...exclude] }
      return query.refetch()
    },
  }
}
