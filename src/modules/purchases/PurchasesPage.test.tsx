import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { PurchaseList } from './components/PurchaseCard'
import type { PurchaseDTO } from './types'

test('failed list never renders previous private cached data; loading and empty are explicit', () => {
  const data = [{ id: 'private-reference', raffleTitle: 'Private product', tickets: [], status: 'paid', totalCents: 100, createdAt: '2026-01-01T00:00:00Z' }] as unknown as PurchaseDTO[]
  const base = { data, isError: true, isPending: false, error: new Error('UNAUTHORIZED'), refetch: async () => {} }
  const html = renderToStaticMarkup(<PurchaseList query={base} />)
  assert.match(html, /role="alert"/)
  assert.match(html, /Reintentar/)
  assert.doesNotMatch(html, /Private product|private-reference|purchase-card/)
  assert.match(renderToStaticMarkup(<PurchaseList query={{ ...base, isError: false, isPending: true }} />), /Cargando apartados/)
  assert.match(renderToStaticMarkup(<PurchaseList query={{ ...base, isError: false, data: [] }} />), /Explorar rifas/)
})
