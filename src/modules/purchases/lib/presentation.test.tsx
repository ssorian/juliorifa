import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { PurchaseCard } from '../components/PurchaseCard'
import { PurchaseSummary } from '../components/PurchaseSummary'
import { auditLabel, purchaseFlags, safePurchaseId, statusLabel } from './presentation'
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
test('new destinations suppress legacy display and preserve empty versus null', () => {
  const methods = [{ id, type: 'clabe' as const, bank: 'Nuevo banco', beneficiary: 'Titular', number: '012345678901234567', instructions: '' }]
  const html = renderToStaticMarkup(<PurchaseSummary purchase={{ ...fixture, paymentMethods: methods }} />)
  assert.match(html, /Nuevo banco/)
  assert.match(html, /Copiar CLABE/)
  assert.doesNotMatch(html, /Cuenta fixture/)
  const empty = renderToStaticMarkup(<PurchaseSummary purchase={{ ...fixture, paymentMethods: [] }} />)
  assert.match(empty, /No hay destinos bancarios/)
  assert.doesNotMatch(empty, /Cuenta fixture/)
  assert.match(renderToStaticMarkup(<PurchaseSummary purchase={{ ...fixture, paymentMethods: null }} />), /Cuenta fixture/)
})

test('cards show product fallback, short folio and six textual status badges', () => {
  for (const [status, cta] of Object.entries({
    awaiting_proof: 'Ver instrucciones de pago',
    reviewing: 'Consultar revisión',
    paid: 'Ver boletos confirmados',
    cancelled: 'Ver detalle',
    rejected: 'Ver detalle',
    expired: 'Ver detalle',
  })) {
    const html = renderToStaticMarkup(
      <PurchaseCard
        purchase={{ ...fixture, status: status as PurchaseDTO['status'] }}
      />,
    )
    assert.match(html, /Apartado 11111111/)
    assert.match(html, /Producto no disponible/)
    assert.match(html, /Imagen no disponible/)
    assert.doesNotMatch(html, /Rifa 11111111/)
    assert.match(html, /APARTADO ·/)
    assert.match(html, /class="button primary"/)
    assert.match(html, /MXN \/ total/)
    assert.match(html, /Ver apartado/)
    assert.match(html, new RegExp(`purchase-status--${status}`))
    assert.ok(html.includes(statusLabel(status as PurchaseDTO['status'])))
    assert.ok(html.includes(cta))
    assert.ok(html.includes(`/mis-compras?id=${id}`))
    assert.match(html, />31 dic 2019, 18:00 \(Ciudad de México\)</)
    assert.doesNotMatch(html, /<button|Subir comprobante/)
  }
})

test('available raffle title is used without replacing the full payment reference', () => {
  const html = renderToStaticMarkup(
    <PurchaseCard purchase={{ ...fixture, raffleTitle: 'Premio histórico' }} />,
  )
  assert.match(html, /Premio histórico/)
  const image = renderToStaticMarkup(<PurchaseCard purchase={{ ...fixture, raffleTitle: 'Producto', raffleImageUrl: '/api/media/images/verified' }} />)
  assert.match(image, /src="\/api\/media\/images\/verified"/)
  assert.match(image, /alt="Producto"/)
  assert.doesNotMatch(image, /Imagen no disponible/)
  const summary = renderToStaticMarkup(<PurchaseSummary purchase={fixture} />)
  assert.ok(summary.includes(id))
  assert.match(summary, /31 dic 2019, 18:00/)
})

test('detail summary uses a quiet reference and bounded accessible ticket disclosure', () => {
  const html = renderToStaticMarkup(<PurchaseSummary purchase={{ ...fixture, tickets: Array.from({ length: 1000 }, (_, i) => i) }} />)
  assert.match(html, /<h2>Tu apartado<\/h2>/)
  assert.doesNotMatch(html, /<h2>Apartado /)
  assert.match(html, /<details/)
  assert.match(html, /Ver todos los 1000 boletos/)
  assert.match(html, /purchase-ticket-chip/)
  assert.match(html, />999<\/span>/)
  assert.ok(html.includes(id))
  const titled = renderToStaticMarkup(<PurchaseSummary purchase={{ ...fixture, raffleTitle: 'Premio real' }} />)
  assert.match(titled, /<h2>Premio real<\/h2>/)
  const large = renderToStaticMarkup(<PurchaseSummary purchase={{ ...fixture, paymentInstructions: null, tickets: Array.from({ length: 107 }, (_, i) => i) }} />)
  assert.match(large, /Ver todos los 107 boletos/)
  assert.match(large, /No hay instrucciones bancarias guardadas/)
  assert.doesNotMatch(large, /Banco fixture/)
})

test('SSR reviewing is retained not paid; server total without surcharge and snapshot labels', () => {
  const html = renderToStaticMarkup(<PurchaseSummary purchase={fixture} />)
  assert.match(html, /Por confirmar/)
  assert.match(html, /sin vencimiento automático/)
  assert.doesNotMatch(html, /Confirmado|Fecha límite para subir|129[.,]63/)
  assert.match(html, /123[.,]45/)
  assert.match(html, /Banco fixture/)
  assert.match(html, /Concepto fixture/)
  assert.match(html, /0 boletos|>0<| · 0|<!-- -->0|>0/)
})
test('summary exposes persisted purchase progress, including legacy dates and terminal branches', () => {
  for (const [status, label] of Object.entries({
    awaiting_proof: 'Comprobante por enviar',
    reviewing: 'Pago por confirmar',
    paid: 'Pago confirmado',
    cancelled: 'Cancelado: estos boletos no participan',
    rejected: 'Rechazado — boletos liberados: estos boletos no participan',
    expired: 'Vencido — boletos liberados: estos boletos no participan',
  })) {
    const html = renderToStaticMarkup(
      <PurchaseSummary
        purchase={{
          ...fixture,
          status: status as PurchaseDTO['status'],
          proofReceivedAt: null,
          reviewedAt: null,
        }}
      />,
    )
    assert.match(html, /aria-label="Seguimiento del apartado"/)
    assert.ok(html.includes(label))
    assert.doesNotMatch(html, /Revisado:|Comprobante recibido:/)
    if (['cancelled', 'rejected', 'expired'].includes(status))
      assert.doesNotMatch(html, /<ol/)
    else assert.match(html, /<ol/)
  }
})

test('audit translates known events without inventing unknown history', () => {
  assert.equal(auditLabel('reserved'), 'Apartado creado')
  assert.equal(auditLabel('reviewing'), 'Comprobante recibido')
  assert.equal(auditLabel('paid'), 'Pago confirmado')
  assert.equal(auditLabel('unexpected-event'), 'unexpected-event')
  assert.equal(auditLabel('toString'), 'toString')
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
