import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  passwordSettings,
  authRateLimit,
  normalizeCallback,
} from './auth-settings'

test('native password policy enables unverified automatic registration sessions', () => {
  assert.deepEqual(passwordSettings, {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
    autoSignIn: true,
  })
  assert.equal(authRateLimit.enabled, true)
  assert.equal(authRateLimit.storage, 'memory')
  for (const path of ['/sign-in/email', '/sign-up/email'] as const)
    assert.deepEqual(authRateLimit.customRules[path], { max: 5, window: 60 })
})
test('both password callbacks preserve only valid checkout IDs', () => {
  assert.equal(
    normalizeCallback(
      'https://evil.invalid/dashboard?checkout=' + 'a'.repeat(32),
    ),
    '/auth/complete?checkout=' + 'a'.repeat(32),
  )
  for (const callback of [
    '/dashboard',
    '//evil.invalid',
    '/?checkout=invalid',
    undefined,
  ])
    assert.equal(normalizeCallback(callback), '/auth/complete')
})
