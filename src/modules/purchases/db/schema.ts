import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  primaryKey,
  unique,
  check,
  index,
  jsonb,
} from 'drizzle-orm/pg-core'
import { raffles } from '../../raffles/db/schema'
import { user } from '../../auth/db/schema'
import { mediaAssets } from '../../../lib/storage/db'
import type { PaymentInstructions } from '../types'
import type { PaymentMethod } from '../../settings/domain'

export const purchaseStates = [
  'awaiting_proof',
  'reviewing',
  'paid',
  'rejected',
  'expired',
  'cancelled',
] as const
export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey(),
    raffleId: uuid('raffle_id')
      .notNull()
      .references(() => raffles.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadDigest: text('payload_digest').notNull(),
    status: text('status', { enum: purchaseStates }).notNull(),
    priceCents: integer('price_cents').notNull(),
    feeBps: integer('fee_bps').notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    feeCents: integer('fee_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    paymentSnapshot: jsonb('payment_snapshot').$type<PaymentInstructions>(),
    paymentMethodsSnapshot: jsonb('payment_methods_snapshot').$type<PaymentMethod[]>(),
    proofAssetId: uuid('proof_asset_id').references(() => mediaAssets.id),
    proofKey: text('proof_key'),
    proofDigest: text('proof_digest'),
    proofReceivedAt: timestamp('proof_received_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewerId: text('reviewer_id').references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('purchase_user_idempotency').on(t.userId, t.idempotencyKey),
    index('purchase_raffle_expiry').on(t.raffleId, t.status, t.expiresAt),
    check(
      'purchase_status_valid',
      sql`${t.status} in ('awaiting_proof','reviewing','paid','rejected','expired','cancelled')`,
    ),
    check(
      'purchase_money_valid',
      sql`${t.priceCents}>0 and ${t.feeBps} between 0 and 10000 and ${t.subtotalCents}>0 and ${t.feeCents}>=0 and ${t.totalCents}=${t.subtotalCents}`,
    ),
  ],
)
export const orderTickets = pgTable(
  'order_tickets',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchases.id),
    ticketNumber: integer('ticket_number').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.ticketNumber] }),
    check('order_ticket_positive', sql`${t.ticketNumber}>=0`),
  ],
)
export const occupancy = pgTable(
  'ticket_occupancy',
  {
    raffleId: uuid('raffle_id')
      .notNull()
      .references(() => raffles.id),
    ticketNumber: integer('ticket_number').notNull(),
    state: text('state', {
      enum: ['blocked', 'reserved', 'reviewing', 'sold'],
    }).notNull(),
    orderId: uuid('order_id').references(() => purchases.id),
  },
  (t) => [
    primaryKey({ columns: [t.raffleId, t.ticketNumber] }),
    check(
      'occupancy_valid',
      sql`${t.ticketNumber}>=0 and ((${t.state}='blocked' and ${t.orderId} is null) or (${t.state} in ('reserved','reviewing','sold') and ${t.orderId} is not null))`,
    ),
  ],
)
export const purchaseEvents = pgTable('purchase_events', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => purchases.id),
  type: text('type').notNull(),
  reason: text('reason'),
  actorId: text('actor_id').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
export const paymentSettingsEvents = pgTable('payment_settings_events', {
  id: uuid('id').primaryKey(),
  actorId: text('actor_id')
    .notNull()
    .references(() => user.id),
  snapshot: jsonb('snapshot').$type<PaymentInstructions>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
export const paymentSettings = pgTable(
  'payment_settings',
  {
    id: integer('id').primaryKey(),
    bank: text('bank').notNull(),
    beneficiary: text('beneficiary').notNull(),
    account: text('account').notNull(),
    instructions: text('instructions').notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check('payment_settings_singleton', sql`${t.id}=1`)],
)
