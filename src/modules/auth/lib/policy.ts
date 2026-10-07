export type Role = 'client' | 'admin'

// Creation is deliberately independent of all caller-provided fields.
export function initialRole(_input: unknown): Role {
  return 'client'
}
export function dashboardAccess(user: { role: string } | null): boolean {
  return user?.role === 'admin'
}
export function safeCheckoutId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value)
    ? value
    : undefined
}
export function postAuthDestination(role: string, checkout: unknown): string {
  if (role === 'admin') return '/dashboard'
  const id = safeCheckoutId(checkout)
  return id ? `/?checkout=${id}` : '/'
}
export function completionPath(checkout: unknown): string {
  const id = safeCheckoutId(checkout)
  return id ? `/auth/complete?checkout=${id}` : '/auth/complete'
}
