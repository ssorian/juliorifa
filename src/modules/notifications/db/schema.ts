import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  unique,
  check,
  index,
} from 'drizzle-orm/pg-core'

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey(),
    event: text('event').notNull(),
    key: text('key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['ready', 'leased', 'sent', 'dead'] })
      .notNull()
      .default('ready'),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    deadAt: timestamp('dead_at', { withTimezone: true }),
    lastError: text('last_error'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('outbox_event_key').on(t.event, t.key),
    check(
      'outbox_lease_valid',
      sql`${t.attempts}>=0 and ${t.status} in ('ready','leased','sent','dead') and (${t.status}<>'leased' or (${t.leaseToken} is not null and ${t.leaseUntil} is not null))`,
    ),
    index('outbox_ready_idx').on(t.status, t.availableAt),
  ],
)
