import type { PurchaseStatus } from './domain'

export interface PurchaseDTO {
  id: string
  raffleId: string
  status: PurchaseStatus
  priceCents: number
  feeBps: number
  subtotalCents: number
  feeCents: number
  totalCents: number
  tickets: number[]
  expiresAt: string
  createdAt: string
  proofReceivedAt: string | null
  paymentInstructions: PaymentInstructions | null
  reviewedAt: string | null
  // Only present in requireAdmin-protected DTOs, never own/public responses.
  customer?: { name: string; email: string }
  proofVerified?: boolean
}
export interface PaymentInstructions {
  bank: string
  beneficiary: string
  account: string
  instructions: string
}
