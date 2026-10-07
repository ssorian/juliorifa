import { state } from './state'
import { createOutboxRepository } from '../../src/modules/notifications/repository'
import type { OutboxDatabase } from '../../src/modules/notifications/repository'
import { prepareDelivery } from '../../src/modules/notifications/delivery'
import { processOutbox } from '../../src/modules/notifications/worker'

export async function pump() {
  await state.ready
  const database = state.db as unknown as OutboxDatabase
  return processOutbox(createOutboxRepository(database), (event) =>
    prepareDelivery(database, event, 'http://127.0.0.1:3212'),
  )
}
