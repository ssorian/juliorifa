import { createContext, useContext, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminError, adminKey } from '../lib/admin'

export const AdminIdentity = createContext('')
export function useAdminQuery<T>(
  kind: string,
  id: string,
  queryFn: () => Promise<T>,
) {
  const actor = useContext(AdminIdentity)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: adminKey(actor, kind, id),
    queryFn,
    enabled: !!actor,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 30000,
  })
  useEffect(() => {
    if (
      query.error &&
      ['FORBIDDEN', 'UNAUTHORIZED'].includes(query.error.message)
    ) {
      void client.cancelQueries({ queryKey: ['private-admin'] })
      client.removeQueries({ queryKey: ['private-admin'] })
      client.setQueriesData({ queryKey: ['current-user'] }, null)
      void client.invalidateQueries({ queryKey: ['current-user'] })
    }
  }, [query.error, client])
  return { ...query, data: query.isError ? undefined : query.data }
}
export function useAdminAction() {
  const client = useQueryClient()
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('')
  async function refresh() {
    await Promise.all(
      [
        'private-admin',
        'own-purchases',
        'public-raffles',
        'public-raffle',
        'public-draw',
        'public-inventory',
      ].map((prefix) => client.invalidateQueries({ queryKey: [prefix] })),
    )
  }
  async function run<T>(
    operation: () => Promise<T>,
    message: string,
  ): Promise<T | undefined> {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await operation()
      setNotice(message)
      await refresh()
      return result
    } catch (e) {
      setError(adminError(e))
      if (
        e instanceof Error &&
        ['FORBIDDEN', 'UNAUTHORIZED'].includes(e.message)
      ) {
        await client.cancelQueries({ queryKey: ['private-admin'] })
        client.removeQueries({ queryKey: ['private-admin'] })
        client.setQueriesData({ queryKey: ['current-user'] }, null)
        await client.invalidateQueries({ queryKey: ['current-user'] })
      } else await refresh()
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, notice, error, run, refresh }
}
