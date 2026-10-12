import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePaymentInstructions } from './payment-config'

const configured = { bank: 'B', beneficiary: 'N', account: '123', instructions: 'Pay' }
const environment = { PAYMENT_BANK: 'E', PAYMENT_BENEFICIARY: 'N', PAYMENT_ACCOUNT: '456', PAYMENT_INSTRUCTIONS: 'Pay' }
test('explicitly configured methods disable both singleton and environment fallback', () => {
  assert.equal(resolvePaymentInstructions(configured, environment, false), null)
  assert.equal(resolvePaymentInstructions(null, environment, false), null)
})
test('never configured destinations retain complete legacy fallback only', () => {
  assert.deepEqual(resolvePaymentInstructions(configured, environment), configured)
  assert.equal(resolvePaymentInstructions(null, environment)?.account, '456')
  assert.equal(resolvePaymentInstructions(null, {}), null)
})
