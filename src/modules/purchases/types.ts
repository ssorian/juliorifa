import type { PurchaseStatus } from './domain'
import type { PaymentMethod } from '../settings/domain'

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
  paymentMethods?: PaymentMethod[] | null
  reviewedAt: string | null
  // Only present in requireAdmin-protected DTOs, never own/public responses.
  customer?: {
    name: string
    email: string
    phone?: string | null
    whatsapp?: string | null
  }
  // Current product metadata; not a historical payment snapshot.
  raffleTitle?: string
  raffleImageUrl?: string | null
  proofMime?: string | null
  proofVerified?: boolean
}
export interface PaymentInstructions {
  bank: string
  beneficiary: string
  account: string
  instructions: string
}
