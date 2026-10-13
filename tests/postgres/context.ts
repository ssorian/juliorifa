import { AsyncLocalStorage } from 'node:async_hooks'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '../../src/db/schema'

export const context = new AsyncLocalStorage<{ database: NodePgDatabase<typeof schema>; actor: { id: string; role: 'client' | 'admin' } }>()
export function current() {
  const state = context.getStore()
  if (!state) throw new Error('ISOLATION_CONTEXT_REQUIRED')
  return state
}
