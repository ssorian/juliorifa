import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToString } from 'react-dom/server'
import {
  adminKey,
  canRenderAdmin,
  decimalCents,
  mexicoISO,
  parseSelection,
  canReview,
  labels,
} from './admin'
import { RevenueChart } from '../components/RevenueChart'
import { PurchaseFacts } from '../components/PurchaseFacts'

test('admin identity/cache partition and review policy do not trust client roles', () => {
  assert.equal(canRenderAdmin({ id: 'a', role: 'admin' }, 'b'), false)
  assert.equal(canRenderAdmin({ id: 'a', role: 'client' }, 'a'), false)
  assert.equal(canRenderAdmin(null, 'a'), false)
  assert.equal(canRenderAdmin({ id: 'a', role: 'admin' }, 'a'), true)
  assert.deepEqual(adminKey('a', 'inventory', 'r'), [
    'private-admin',
    'a',
    'inventory',
    'r',
  ])
  assert.equal(
    canReview({ status: 'awaiting_proof', proofReceivedAt: null }),
    false,
  )
  assert.equal(canReview({ status: 'reviewing', proofReceivedAt: null }), false)
  assert.equal(
    canReview({ status: 'reviewing', proofReceivedAt: '2026-01-01T00:00:00Z' }),
    true,
  )
  assert.equal(
    canReview({ status: 'paid', proofReceivedAt: '2026-01-01T00:00:00Z' }),
    false,
  )
})
test('decimal money, strict inventory and Mexico City input normalization', () => {
  assert.equal(decimalCents('12.30'), 1230)
  assert.equal(decimalCents('0'), 0)
  for (const input of ['1.001', '-1', '1e2', 'NaN', '1,20', ''])
    assert.throws(() => decimalCents(input))
  assert.equal(mexicoISO('2026-07-01T12:00'), '2026-07-01T18:00:00.000Z')
  assert.throws(() => mexicoISO('2026-02-30T12:00'))
  assert.deepEqual(parseSelection('0,2-4', 0, 5), [0, 2, 3, 4])
  for (const input of ['0,0', '0-2,2', '-1', '4-2', '5', '0-1000', '1x', ''])
    assert.throws(() => parseSelection(input, 0, 5))
  assert.throws(() => parseSelection('0-1000', 0, 2000))
})
test('admin purchase facts preserve bank snapshot and pending/legal amounts', () => {
  const fixture = {
    id: '00000000-0000-4000-8000-000000000001',
    raffleId: '00000000-0000-4000-8000-000000000002',
    status: 'reviewing' as const,
    priceCents: 12345,
    feeBps: 100,
    subtotalCents: 24690,
    feeCents: 247,
    totalCents: 24690,
    tickets: [0, 1],
    expiresAt: '2026-01-02T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    proofReceivedAt: '2026-01-01T01:00:00Z',
    reviewedAt: null,
    paymentInstructions: {
      bank: 'Banco anterior',
      beneficiary: 'Titular snapshot',
      account: 'Cuenta anterior',
      instructions: 'Transferencia snapshot',
    },
  }
  const html = renderToString(<PurchaseFacts order={fixture} />)
  assert.match(html, /Contacto no disponible/)
  const contact = renderToString(
    <PurchaseFacts
      order={{
        ...fixture,
        customer: {
          name: 'Fixture',
          email: 'fixture@example.invalid',
          phone: '+525512345678',
          whatsapp: 'https://wa.me/525512345678',
        },
      }}
    />,
  )
  assert.match(contact, /href="https:\/\/wa.me\/525512345678"/)
  assert.match(contact, /WhatsApp manual/)
  assert.match(contact, /\+525512345678/)
  assert.match(html, /Por confirmar/)
  assert.equal(labels.awaiting_proof, 'Sin comprobante')
  assert.equal(labels.paid, 'Confirmado')
  assert.equal(labels.cancelled, 'Cancelado')
  assert.match(html, /246\.90/)
  assert.match(html, /2\.47/)
  assert.match(html, /Banco anterior/)
  assert.match(html, /Cuenta anterior/)
  assert.doesNotMatch(html, /Pago confirmado|correo enviado|iframe|bucket/)
  for (const status of [
    'awaiting_proof',
    'paid',
    'rejected',
    'expired',
    'cancelled',
  ] as const)
    assert.ok(
      renderToString(<PurchaseFacts order={{ ...fixture, status }} />).length >
        0,
    )
  assert.match(
    renderToString(
      <PurchaseFacts order={{ ...fixture, paymentInstructions: null }} />,
    ),
    /sin snapshot/,
  )
})
test('server finance chart uses cents and single nonempty SVG title children', () => {
  const chart = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    paidCents: i === 0 ? 12345 : 0,
    orders: i === 0 ? 1 : 0,
  }))
  const html = renderToString(<RevenueChart chart={chart} />)
  const titles = [...html.matchAll(/<title>(.*?)<\/title>/g)]
  assert.equal(titles.length, 15)
  assert.ok(titles.every((t) => t[1].length > 0 && !t[1].includes('<!--')))
  assert.match(html, /123\.45/)
})
