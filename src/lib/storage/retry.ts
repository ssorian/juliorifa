export const MAX_ATTEMPTS = 8
export const LEASE_MS = 600000
export function retryDelay(attempt: number) {
  return Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1))
}
