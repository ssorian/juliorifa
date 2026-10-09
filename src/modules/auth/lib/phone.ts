/** International input only: never guess a country for a local number. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null
  const input = value.trim()
  if (!/^\+[\d ()-]+$/.test(input)) return null
  const phone = input.replace(/[ ()-]/g, '')
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null
}
export function requireRegistrationPhone(value: unknown): string {
  const phone = normalizePhone(value)
  if (!phone) throw new Error('PHONE_REQUIRED')
  return phone
}
/** Admin-only projection; this is a manual link, never a messaging transport. */
export function winnerContact(name: string, value: unknown) {
  const phone = normalizePhone(value)
  return phone
    ? { name, phone, whatsapp: `https://wa.me/${phone.slice(1)}` }
    : null
}
