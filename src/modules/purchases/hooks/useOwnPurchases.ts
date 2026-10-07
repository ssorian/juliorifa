import { useQuery } from '@tanstack/react-query'
import { ownPurchase, ownPurchases, purchaseAudit } from '../server'
import { ownKey } from '../lib/presentation'

export function useOwnPurchases(
  userId: string,
  offset: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ownKey(userId, 'list', String(offset)),
    queryFn: () => ownPurchases({ data: { offset, limit: 20 } }),
    enabled,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  })
}
export function useOwnPurchase(userId: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ownKey(userId, 'detail', id),
    queryFn: () => ownPurchase({ data: { id } }),
    enabled,
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  })
}
export function useOwnAudit(userId: string, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ownKey(userId, 'audit', id),
    queryFn: () => purchaseAudit({ data: { id } }),
    enabled,
    retry: false,
    gcTime: 0,
  })
}
