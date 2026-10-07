import test from 'node:test'
import assert from 'node:assert/strict'
import { retryDelay, deliveryTemplate, eventKey } from './domain'

test('retry exponential bounded, stable event key and plaintext fixed origin', () => {
  assert.equal(retryDelay(1), 30000)
  assert.equal(retryDelay(8), 3600000)
  assert.equal(eventKey('id'), eventKey('id'))
  const text = deliveryTemplate('raffle.winner', {
    title: 'Prize',
    ticket: 0,
    beneficiary: 'Organizer',
    reason: '',
    origin: 'https://app.test/ignored?redirect=evil',
  }).text
  assert.match(text, /https:\/\/app.test\/mis-compras/)
  assert.doesNotMatch(text, /redirect=evil/)
  assert.match(text, /0/)
  assert.throws(() =>
    deliveryTemplate('raffle.winner', {
      title: 'P',
      ticket: 0,
      beneficiary: 'O',
      reason: '',
      origin: 'javascript:alert(1)',
    }),
  )
})
