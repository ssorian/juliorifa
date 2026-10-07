import { safeCheckoutId } from '../../auth/lib/policy'

const TTL = 30 * 60_000

export async function recoverCheckout<T extends { id: string }>(
  raw: string | null,
  id: string,
  repository: {
    lookup: (key: string) => Promise<T | null>
    available: (
      cart: NonNullable<ReturnType<typeof readCheckout>>,
    ) => Promise<number[]>
  },
  now = Date.now(),
) {
  const cart = readCheckout(raw, now)
  if (!checkoutKey(id) || !cart || (cart.intentId && cart.intentId !== id))
    return { kind: 'discard' as const }
  const purchase = await repository.lookup(id)
  if (purchase) return { kind: 'owned' as const, purchase }
  const picks = await repository.available(cart)
  return { kind: 'cart' as const, cart, picks }
}
export function nextIntent(
  previous: { id: string; payload: string } | null,
  picks: number[],
  createId: () => string,
) {
  const payload = JSON.stringify([...picks].sort((a, b) => a - b))
  return previous?.payload === payload ? previous : { id: createId(), payload }
}
export function checkoutKey(id: unknown) {
  return safeCheckoutId(id) ? `nova.checkout.${id}` : undefined
}
export function makeCheckout(
  raffleId: string,
  picks: number[],
  now = Date.now(),
  intentId?: string,
) {
  return {
    raffleId,
    picks,
    expires: now + TTL,
    ...(intentId ? { intentId } : {}),
  }
}
export function readCheckout(raw: string | null, now = Date.now()) {
  try {
    const value = JSON.parse(raw || 'null')
    if (
      !value ||
      typeof value.raffleId !== 'string' ||
      !/^[\w-]{1,100}$/.test(value.raffleId) ||
      !Number.isFinite(value.expires) ||
      value.expires <= now ||
      value.expires > now + TTL ||
      (value.intentId !== undefined && !safeCheckoutId(value.intentId)) ||
      !Array.isArray(value.picks) ||
      value.picks.length > 1000 ||
      !value.picks.every(
        (n: unknown) =>
          typeof n === 'number' && Number.isSafeInteger(n) && n >= 0,
      )
    )
      return null
    return value as {
      raffleId: string
      picks: number[]
      expires: number
      intentId?: string
    }
  } catch {
    return null
  }
}
export function restoreCheckout(
  raw: string | null,
  raffleId: string,
  available: Set<number>,
  now = Date.now(),
): number[] {
  const value = readCheckout(raw, now)
  return value?.raffleId === raffleId
    ? [...new Set(value.picks)].filter((n) => available.has(n))
    : []
}
