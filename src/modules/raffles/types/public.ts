import type {
  publicRaffle,
  availableInventory,
  publicDraw,
} from '../services/server'

export type PublicRaffleDTO = Awaited<ReturnType<typeof publicRaffle>>
export type InventoryDTO = Awaited<ReturnType<typeof availableInventory>>
export type PublicDrawDTO = Awaited<ReturnType<typeof publicDraw>>
