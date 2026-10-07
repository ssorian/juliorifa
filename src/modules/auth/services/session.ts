import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { auth } from '../../../lib/auth'
import { db } from '../../../db'
import { user } from '../db/schema'
import { resolveCurrentUser } from '../lib/session-resolution'

export const currentUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    return resolveCurrentUser(
      () =>
        auth.api.getSession({
          headers: getRequestHeaders(),
          query: { disableCookieCache: true },
        }),
      async (id) => {
        const records = await db
          .select({ id: user.id, name: user.name, role: user.role })
          .from(user)
          .where(eq(user.id, id))
          .limit(1)
        return records.at(0) ?? null
      },
    )
  },
)
