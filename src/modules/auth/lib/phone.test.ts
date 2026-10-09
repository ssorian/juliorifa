import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePhone,
  winnerContact,
  requireRegistrationPhone,
} from './phone'

test('new registrations require international phone server-side', () => {
  assert.equal(requireRegistrationPhone('+52 (55) 1234-5678'), '+525512345678')
  for (const value of [
    undefined,
    '',
    '5512345678',
    '+012345678',
    '+52<script>',
    '+123',
  ]) {
    assert.throws(() => requireRegistrationPhone(value))
  }
  assert.equal(normalizePhone('+1 202 555 0123'), '+12025550123')
})
test('legacy contact unavailable; manual WhatsApp link is sanitized', () => {
  assert.equal(winnerContact('Legacy', null), null)
  assert.equal(winnerContact('Unsafe', 'javascript:alert(1)'), null)
  assert.deepEqual(winnerContact('Winner', '+52 55 1234 5678'), {
    name: 'Winner',
    phone: '+525512345678',
    whatsapp: 'https://wa.me/525512345678',
  })
})
