import { z } from 'zod'

export function purchaseSearch(search: Record<string, unknown>): { id?: string } {
  const id = z.uuid().safeParse(search.id)
  return id.success ? { id: id.data } : {}
}
