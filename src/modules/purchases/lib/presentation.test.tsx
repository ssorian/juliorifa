import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { PurchaseSummary } from '../components/PurchaseSummary'
import { purchaseFlags, safePurchaseId, statusLabel } from './presentation'
import type { PurchaseDTO } from '../types'

const id = '11111111-1111-4111-8111-111111111111'
const fixture: PurchaseDTO = {
  id,
  raffleId: id,
  status: 'reviewing',
  priceCents: 12345,
  feeBps: 500,
  subtotalCents: 12345,
  feeCents: 618,
  totalCents: 12345,
  tickets: [0],
  expiresAt: '2020-01-02T00:00:00Z',
  createdAt: '2020-01-01T00:00:00Z',
  proofReceivedAt: '2020-01-01T01:00:00Z',
  paymentInstructions: {
    bank: 'Banco fixture',
    beneficiary: 'Beneficiario fixture',
    account: 'Cuenta fixture',
    instructions: 'Concepto fixture',
  },
  reviewedAt: null,
}
test('SSR reviewing is retained not paid; server total without surcharge and snapshot labels', () => {
  const html = renderToStaticMarkup(<PurchaseSummary purchase={fixture} />)
  assert.match(html, /En revisión/)
  assert.match(html, /sin vencimiento automático/)
  assert.doesNotMatch(html, /Pago aprobado|Fecha límite para subir|129[.,]63/)
  assert.match(html, /123[.,]45/)
  assert.match(html, /Banco fixture/)
  assert.match(html, /Concepto fixture/)
  assert.match(html, /0 boletos|>0<| · 0|<!-- -->0|>0/)
})
test('all terminal statuses do not allow upload/cancel and UUID route rejects arbitrary IDs', () => {
  for (const status of ['paid', 'expired', 'rejected', 'cancelled'] as const) {
    const flags = purchaseFlags(status, '2099-01-01', Date.parse('2026-01-01'))
    assert.equal(flags.upload, false)
    assert.equal(flags.cancel, false)
    assert.ok(statusLabel(status))
  }
  assert.equal(
    purchaseFlags('awaiting_proof', '2026-01-01', Date.parse('2026-01-01'))
      .cancel,
    false,
  )
  assert.equal(
    purchaseFlags('awaiting_proof', '2099-01-01', null).upload,
    false,
  )
  assert.equal(safePurchaseId(id), true)
  for (const value of ['../other', 'demo-1', 'https://bad.test', null])
    assert.equal(safePurchaseId(value), false)
})
