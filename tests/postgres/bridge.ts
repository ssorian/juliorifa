import { current } from './context'

// This module is reachable only through the isolated runner's scoped Node hook.
export const db = new Proxy({}, {
  get(_target, property) {
    const database = current().database
    const value = Reflect.get(database, property)
    return typeof value === 'function' ? value.bind(database) : value
  },
})
export async function requireUser() { return current().actor }
export async function requireClient() {
  const actor = current().actor
  if (actor.role !== 'client') throw new Error('FORBIDDEN')
  return actor
}
export async function requireAdmin() {
  const actor = current().actor
  if (actor.role !== 'admin') throw new Error('FORBIDDEN')
  return actor
}
