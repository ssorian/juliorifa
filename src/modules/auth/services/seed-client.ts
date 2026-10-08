import { randomUUID } from 'node:crypto'
import { hashPassword, verifyPassword } from 'better-auth/crypto'

export interface SeedConnection {
  query: (
    sql: string,
    params?: Array<string>,
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}
export interface SeedRepository {
  transaction: <T>(work: (tx: SeedConnection) => Promise<T>) => Promise<T>
}

// Private development fixture only; never imported by public auth or UI.
const email = 'user@gmail.com'
const password = 'user123'

export async function seedClient(
  repository: SeedRepository,
): Promise<'created' | 'existing'> {
  return repository.transaction(async (tx) => {
    // Serializes cooperating seed runs; unique email also protects against other writers.
    await tx.query('SELECT pg_advisory_xact_lock(73629104)')
    const { rows } = await tx.query(
      'SELECT * FROM "user" WHERE lower(email) = $1 FOR UPDATE',
      [email],
    )
    if (rows.length) {
      const existing = rows[0]
      const credentials = await tx.query(
        'SELECT * FROM account WHERE user_id = $1 FOR UPDATE',
        [String(existing.id)],
      )
      const credential = credentials.rows[0]
      let equivalent = false
      if (
        rows.length === 1 &&
        existing.email === email &&
        existing.role === 'client' &&
        existing.email_verified === false &&
        credentials.rows.length === 1 &&
        credential.provider_id === 'credential' &&
        credential.account_id === existing.id &&
        typeof credential.password === 'string'
      ) {
        try {
          equivalent = await verifyPassword({
            hash: credential.password,
            password,
          })
        } catch {
          /* Malformed hashes are collisions too. */
        }
      }
      if (!equivalent)
        throw new Error('Seed collision: existing identity cannot be changed')
      return 'existing'
    }
    const id = randomUUID()
    const hash = await hashPassword(password)
    await tx.query(
      'INSERT INTO "user" (id, name, email, role, email_verified) VALUES ($1, $2, $3, $4, false)',
      [id, 'Development client', email, 'client'],
    )
    await tx.query(
      'INSERT INTO account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), id, 'credential', id, hash],
    )
    return 'created'
  })
}
