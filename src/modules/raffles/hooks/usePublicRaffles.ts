import { useQuery } from '@tanstack/react-query'
import { publicRaffles, publicRaffle, publicDraw } from '../services/server'

export function usePublicRaffles(offset: number) {
  return useQuery({
    queryKey: ['public-raffles', offset],
    queryFn: () => publicRaffles({ data: { offset, limit: 24 } }),
    retry: false,
  })
}
export function usePublicRaffle(id: string | null) {
  return useQuery({
    queryKey: ['public-raffle', id],
    queryFn: () => publicRaffle({ data: { id: id! } }),
    enabled: !!id,
    retry: false,
  })
}
export function usePublicDraw(id: string) {
  return useQuery({
    queryKey: ['public-draw', id],
    queryFn: () => publicDraw({ data: { id } }),
    retry: false,
  })
}
