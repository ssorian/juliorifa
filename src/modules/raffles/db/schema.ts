import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, integer, timestamp, jsonb, check } from 'drizzle-orm/pg-core'
import { user } from '../../auth/db/schema'
import { purchases } from '../../purchases/db/schema'

export const raffleStates = ['draft','active','paused','scheduled','closed','drawn','archived'] as const
export const raffles = pgTable('raffles', {
  id: uuid('id').primaryKey(), title: text('title').notNull(), description: text('description').notNull(),
  status: text('status', { enum: raffleStates }).notNull().default('draft'),
  startNumber: integer('start_number').notNull().default(1),
  prizeCostCents: integer('prize_cost_cents').notNull().default(0), expensesCents: integer('expenses_cents').notNull().default(0),
  drawAt: timestamp('draw_at', {withTimezone:true}),
  ticketCount: integer('ticket_count').notNull(), priceCents: integer('price_cents').notNull(), feeBps: integer('fee_bps').notNull().default(0),
  salesDeadline: timestamp('sales_deadline', { withTimezone: true }).notNull(),
  features: jsonb('features').$type<Array<{title:string;description:string}>>().notNull().default([]),
  images: jsonb('images').$type<Array<{key:string;alt:string}>>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('raffle_numbers_valid', sql`${t.ticketCount} between 1 and 1000000 and ${t.startNumber}>=0 and ${t.startNumber}::bigint+${t.ticketCount}-1<=2147483647 and ${t.priceCents} > 0 and ${t.feeBps} between 0 and 10000 and ${t.prizeCostCents}>=0 and ${t.expensesCents}>=0 and (${t.drawAt} is null or ${t.drawAt}>=${t.salesDeadline})`), check('raffle_status_valid', sql`${t.status} in ('draft','active','paused','scheduled','closed','drawn','archived')`)])
export const draws = pgTable('raffle_draws', {
  id: uuid('id').primaryKey(), raffleId: uuid('raffle_id').notNull().unique().references(()=>raffles.id),
  candidateCount: integer('candidate_count'), randomIndex: integer('random_index'), algorithm: text('algorithm'),
  candidateDigest: text('candidate_digest').notNull(), winnerTicket: integer('winner_ticket').notNull(), winnerOrderId: uuid('winner_order_id').notNull().references(()=>purchases.id),
  actorId: text('actor_id').notNull().references(()=>user.id), createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
}, t=>[check('draw_audit_valid',sql`${t.winnerTicket}>=0 and (${t.candidateCount} is null or (${t.candidateCount}>0 and ${t.randomIndex}>=0 and ${t.randomIndex}<${t.candidateCount}))`)])
