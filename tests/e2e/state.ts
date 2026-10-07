import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../src/db/schema'

type Message = {
  to: string
  subject: string
  text: string
  idempotencyKey?: string
}
const symbol = Symbol.for('juliorifa.isolated.fixture')
function createState() {
  const pg = new PGlite()
  const db = drizzle(pg, { schema })
  const ready = (async () => {
    const directory = new URL('../../drizzle/', import.meta.url)
    for (const name of readdirSync(directory)
      .filter((n) => /^000[0-4].*\.sql$/.test(n))
      .sort()) {
      await pg.exec(readFileSync(new URL(name, directory), 'utf8'))
    }
  })()
  return {
    pg,
    db,
    ready,
    messages: [] as Message[],
    objects: new Map<string, { bytes: Buffer; mime: string }>(),
    key: randomBytes(32),
  }
}
const globals = globalThis as typeof globalThis & {
  [symbol]?: ReturnType<typeof createState>
}
export const state = (globals[symbol] ??= createState())
export function signature(value: string) {
  return createHmac('sha256', state.key).update(value).digest('hex')
}
export function validSignature(value: string, signatureValue: string) {
  const actual = Buffer.from(signatureValue)
  const expected = Buffer.from(signature(value))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
