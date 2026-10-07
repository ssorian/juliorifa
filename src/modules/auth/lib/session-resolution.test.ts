import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCurrentUser } from './session-resolution'
import { dashboardAccess, postAuthDestination } from './policy'

test('server authorization denies anonymous without querying users', async () => {
  const user = await resolveCurrentUser(
    async () => null,
    async () => {
      throw new Error('must not query')
    },
  )
  assert.equal(dashboardAccess(user), false)
})
test('server uses current DB role; revoked/deleted admin never renders dashboard', async () => {
  const session = async () => ({ user: { id: 'existing' }, role: 'admin' })
  const client = await resolveCurrentUser(session, async (id) => ({
    id,
    name: 'Test',
    role: 'client',
  }))
  assert.equal(dashboardAccess(client), false)
  assert.equal(postAuthDestination(client!.role, '//evil'), '/')
  assert.equal(await resolveCurrentUser(session, async () => null), null)
  const admin = await resolveCurrentUser(session, async (id) => ({
    id,
    name: 'Test',
    role: 'admin',
  }))
  assert.equal(dashboardAccess(admin), true)
  assert.equal(postAuthDestination(admin!.role, 'a'.repeat(32)), '/dashboard')
})
