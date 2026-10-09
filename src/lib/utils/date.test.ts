import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDate } from './date'

test('human dates use Mexico City across UTC midnight, with safe invalid fallback', () => {
  assert.match(formatDate('2026-06-19T01:30:00Z'), /18 jun 2026/)
  assert.match(formatDate('2026-06-19T01:30:00Z'), /19:30/)
  assert.equal(formatDate('invalid'), 'Fecha no disponible')
})
