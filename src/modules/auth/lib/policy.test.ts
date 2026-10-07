import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialRole,
  postAuthDestination,
  safeCheckoutId,
  dashboardAccess,
} from './policy'

test('signup never accepts an admin role', () => {
  assert.equal(initialRole({ role: 'admin' }), 'client')
  assert.equal(initialRole({}), 'client')
})
test('dashboard requires a current server admin', () => {
  assert.equal(dashboardAccess(null), false)
  assert.equal(dashboardAccess({ role: 'client' }), false)
  assert.equal(dashboardAccess({ role: 'admin' }), true)
})
test('callback only accepts opaque checkout identifiers and admin always wins', () => {
  const id = 'a'.repeat(32)
  assert.equal(postAuthDestination('admin', id), '/dashboard')
  assert.equal(postAuthDestination('client', id), `/?checkout=${id}`)
  for (const unsafe of [
    'https://evil.test',
    '//evil.test',
    '/dashboard',
    '%2f%2fevil',
    'a'.repeat(33),
  ]) {
    assert.equal(safeCheckoutId(unsafe), undefined)
    assert.equal(postAuthDestination('client', unsafe), '/')
  }
})
