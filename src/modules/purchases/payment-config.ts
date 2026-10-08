import type { PaymentInstructions } from './types'

// Existing server configuration wins; never replace a historical purchase snapshot.
export function resolvePaymentInstructions(
  configured: PaymentInstructions | null,
  environment: Record<string, string | undefined>,
): PaymentInstructions | null {
  const complete = (value: PaymentInstructions | null) =>
    value && Object.values(value).every((part) => part.trim())
  if (complete(configured)) return { ...configured! }
  const fallback = {
    bank: environment.PAYMENT_BANK ?? '',
    beneficiary: environment.PAYMENT_BENEFICIARY ?? '',
    account: environment.PAYMENT_ACCOUNT ?? '',
    instructions: environment.PAYMENT_INSTRUCTIONS ?? '',
  }
  return complete(fallback) ? fallback : null
}
