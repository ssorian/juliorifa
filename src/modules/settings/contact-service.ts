import type { db } from '../../db'
import { businessContact } from './db/schema'
import { contactDTO, contactInput } from './contact-domain'

export function createContactService(
  database: typeof db,
  authorize: () => Promise<{ id: string }>,
) {
  async function publicContact() {
    const [row] = await database.select({
      phone: businessContact.phone,
      whatsapp: businessContact.whatsapp,
    }).from(businessContact).limit(1)
    return contactDTO(row)
  }
  return {
    publicContact,
    async adminContact() {
      await authorize()
      return publicContact()
    },
    async save(input: unknown) {
      const actor = await authorize()
      const value = contactInput.parse(input)
      const values = { ...value, updatedBy: actor.id, updatedAt: new Date() }
      await database.insert(businessContact).values(values).onConflictDoUpdate({
        target: businessContact.id,
        set: values,
      })
      return contactDTO(value)
    },
  }
}
