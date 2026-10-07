import { createServerFn } from '@tanstack/react-start'
import {
  idInput,
  pageInput,
  raffleInput,
  updateInput,
  ticketsInput,
  inventoryInput,
  adminListInput,
} from '../schemas/backend'
import { safe } from '../../purchases/repository'
import * as service from './backend'
import * as drawing from './draw'

export const executeDraw = createServerFn({ method: 'POST' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => drawing.draw(data.id)))
export const publicDraw = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => drawing.result(data.id)))
export const adminDraw = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => drawing.result(data.id, true)))
export const createRaffle = createServerFn({ method: 'POST' })
  .inputValidator(raffleInput)
  .handler(({ data }) => safe(() => service.create(data)))
export const updateRaffle = createServerFn({ method: 'POST' })
  .inputValidator(updateInput)
  .handler(({ data }) => safe(() => service.update(data)))
export const publicRaffles = createServerFn({ method: 'GET' })
  .inputValidator(pageInput)
  .handler(({ data }) => safe(() => service.list(data.offset, data.limit)))
export const adminRaffles = createServerFn({ method: 'GET' })
  .inputValidator(adminListInput)
  .handler(({ data }) =>
    safe(() => service.list(data.offset, data.limit, true, data)),
  )
export const publicRaffle = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => service.detail(data.id)))
export const adminRaffle = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => service.detail(data.id, true)))
export const availableInventory = createServerFn({ method: 'GET' })
  .inputValidator(inventoryInput)
  .handler(({ data }) =>
    safe(() => service.inventory(data.id, data.from, data.limit)),
  )
export const adminInventory = createServerFn({ method: 'GET' })
  .inputValidator(inventoryInput)
  .handler(({ data }) =>
    safe(() => service.inventory(data.id, data.from, data.limit, true)),
  )
export const blockTickets = createServerFn({ method: 'POST' })
  .inputValidator(ticketsInput)
  .handler(({ data }) =>
    safe(() => service.block(data.raffleId, data.tickets, true)),
  )
export const unblockTickets = createServerFn({ method: 'POST' })
  .inputValidator(ticketsInput)
  .handler(({ data }) =>
    safe(() => service.block(data.raffleId, data.tickets, false)),
  )
export const exportInventory = createServerFn({ method: 'GET' })
  .inputValidator(idInput)
  .handler(({ data }) => safe(() => service.csv(data.id)))
