import assert from 'node:assert/strict'
import { test } from 'node:test'
import { purchaseDate, purchaseEvent, purchaseReason } from './purchase-presentation'

test('purchase dates use Mexico City, with safe absent and invalid fallbacks', () => {
  assert.match(purchaseDate('2026-01-01T00:00:00Z'), /31.*dic.*2025.*18:00/)
  assert.equal(purchaseDate(null), 'No disponible')
  assert.equal(purchaseDate('invalid'), 'No disponible')
})
test('audit labels translate known events without inventing unknown reasons', () => {
  assert.equal(purchaseEvent('reviewing'), 'Comprobante recibido')
  assert.equal(purchaseEvent('paid'), 'Pago confirmado')
  assert.equal(purchaseReason('proof_received'), 'Comprobante recibido para revisión manual.')
  assert.equal(purchaseReason('Transferencia verificada por operador'), 'Transferencia verificada por operador')
  assert.equal(purchaseReason('future_reason'), 'future_reason')
  assert.equal(purchaseEvent('future_event'), 'future_event')
})
