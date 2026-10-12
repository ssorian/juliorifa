import { sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  boolean,
  serial,
  timestamp,
  check,
} from 'drizzle-orm/pg-core'
import { user } from '../../auth/db/schema'
import { methodTypes } from '../domain'

export const paymentMethods = pgTable(
  'payment_methods',
  {
    id: uuid('id').primaryKey(),
    position: serial('position').notNull().unique(),
    type: text('type', { enum: methodTypes }).notNull(),
    bank: text('bank').notNull(),
    beneficiary: text('beneficiary').notNull(),
    number: text('number').notNull(),
    instructions: text('instructions').notNull().default(''),
    active: boolean('active').notNull().default(true),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('payment_method_type', sql`${t.type} in ('clabe','card','account')`),
    check(
      'payment_method_number',
      sql`(${t.type}='clabe' and ${t.number} ~ '^[0-9]{18}$') or (${t.type}='card' and ${t.number} ~ '^[0-9]{16}$') or (${t.type}='account' and ${t.number} ~ '^[0-9]{1,20}$')`,
    ),
    check(
      'payment_method_text',
      sql`length(trim(${t.bank})) between 1 and 100 and length(trim(${t.beneficiary})) between 1 and 200 and length(${t.instructions}) <= 2000`,
    ),
  ],
)
