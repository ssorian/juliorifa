import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export { user, session, account, verification } from '../modules/auth/db/schema'
export { raffles, draws } from '../modules/raffles/db/schema'
export {
  purchases,
  orderTickets,
  occupancy,
  purchaseEvents,
  paymentSettings,
  paymentSettingsEvents,
} from '../modules/purchases/db/schema'
export { notificationOutbox } from '../modules/notifications/db/schema'
export { mediaAssets, uploadBudgets, uploadLeases } from '../lib/storage/db'

export const todos = pgTable('todos', {
  id: serial().primaryKey(),
  title: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
