import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  check,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { user } from '../../modules/auth/db/schema'
import { raffles } from '../../modules/raffles/db/schema'
import { purchases } from '../../modules/purchases/db/schema'

export const uploadBudgets = pgTable(
  'upload_budgets',
  {
    activeToken: uuid('active_token'),
    activeUntil: timestamp('active_until', { withTimezone: true }),
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [check('upload_budget_valid', sql`${t.attempts}>=0`)],
)
export const uploadLeases = pgTable(
  'upload_leases',
  {
    kind: text('kind', { enum: ['proof', 'image'] }).notNull(),
    targetId: uuid('target_id').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id),
    token: uuid('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.targetId] }),
    check('upload_lease_kind', sql`${t.kind} in ('proof','image')`),
  ],
)

// Pending/orphan records are durable cleanup work, including process crashes during upload.
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull().unique(),
    kind: text('kind', { enum: ['image', 'proof'] }).notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id),
    raffleId: uuid('raffle_id').references(() => raffles.id),
    purchaseId: uuid('purchase_id').references((): AnyPgColumn => purchases.id),
    status: text('status', {
      enum: ['pending', 'verified', 'orphan', 'cleaning', 'deleted'],
    })
      .notNull()
      .default('pending'),
    cleanupToken: uuid('cleanup_token'),
    cleanupUntil: timestamp('cleanup_until', { withTimezone: true }),
    cleanupAttempts: integer('cleanup_attempts').notNull().default(0),
    cleanupAvailableAt: timestamp('cleanup_available_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    cleanupDeadAt: timestamp('cleanup_dead_at', { withTimezone: true }),
    cleanupError: text('cleanup_error'),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    digest: text('digest').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'media_asset_scope',
      sql`(${t.kind}='proof' and ${t.purchaseId} is not null and ${t.raffleId} is null) or (${t.kind}='image' and ${t.raffleId} is not null and ${t.purchaseId} is null)`,
    ),
    check(
      'media_asset_status',
      sql`${t.status} in ('pending','verified','orphan','cleaning','deleted') and (${t.status}<>'verified' or ${t.verifiedAt} is not null) and (${t.status}<>'cleaning' or (${t.cleanupToken} is not null and ${t.cleanupUntil} is not null)) and ${t.cleanupAttempts}>=0`,
    ),
    check(
      'media_asset_size',
      sql`${t.sizeBytes}>0 and ((${t.kind}='image' and ${t.sizeBytes}<=2097152 and ${t.mime} in ('image/png','image/jpeg','image/webp')) or (${t.kind}='proof' and ${t.sizeBytes}<=10485760 and ${t.mime} in ('image/png','image/jpeg','image/webp','application/pdf')))`,
    ),
    index('media_cleanup_idx').on(t.status, t.createdAt),
  ],
)
