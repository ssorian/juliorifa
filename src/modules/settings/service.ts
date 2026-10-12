import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { db } from '../../db'
import { paymentMethods } from './db/schema'
import { methodInput, updateMethodInput, activationInput } from './domain'
import type { ConfiguredMethod } from './domain'

export function createSettingsService(
  database: typeof db,
  authorize: () => Promise<{ id: string }>,
) {
  const dto = (row: typeof paymentMethods.$inferSelect): ConfiguredMethod => ({
    id: row.id,
    type: row.type,
    bank: row.bank,
    beneficiary: row.beneficiary,
    number: row.number,
    instructions: row.instructions,
    active: row.active,
  })
  return {
    async list() {
      await authorize()
      return (
        await database
          .select()
          .from(paymentMethods)
          .orderBy(paymentMethods.position)
      ).map(dto)
    },
    async add(input: unknown) {
      const actor = await authorize()
      const value = methodInput.parse(input)
      const [row] = await database
        .insert(paymentMethods)
        .values({ ...value, id: randomUUID(), updatedBy: actor.id })
        .returning()
      return dto(row)
    },
    async edit(input: unknown) {
      const actor = await authorize()
      const { id, ...value } = updateMethodInput.parse(input)
      const row = (
        await database
          .update(paymentMethods)
          .set({ ...value, updatedBy: actor.id, updatedAt: new Date() })
          .where(eq(paymentMethods.id, id))
          .returning()
      ).at(0)
      if (!row) throw new Error('NOT_FOUND')
      return dto(row)
    },
    async activate(input: unknown) {
      const actor = await authorize()
      const { id, active } = activationInput.parse(input)
      const row = (
        await database
          .update(paymentMethods)
          .set({ active, updatedBy: actor.id, updatedAt: new Date() })
          .where(eq(paymentMethods.id, id))
          .returning()
      ).at(0)
      if (!row) throw new Error('NOT_FOUND')
      return dto(row)
    },
  }
}
