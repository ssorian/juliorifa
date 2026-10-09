import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { Catalog } from './Catalog'
import type { PublicRaffleDTO } from '../types/public'

test('public catalog SSR uses server cents and zero-based safe DTO without fake inventory or PII', () => {
  const r: PublicRaffleDTO = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Rifa fixture',
    description: 'Descripción fixture',
    status: 'active',
    startNumber: 0,
    ticketCount: 10,
    priceCents: 199,
    features: [],
    images: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    salesDeadline: '2026-01-02T00:00:00Z',
    drawAt: '2026-01-03T00:00:00Z',
  }
  const html = renderToStaticMarkup(<Catalog raffles={[r]} />)
  assert.match(html, /1[.,]99/)
  assert.match(html, /Rifa fixture/)
  assert.match(html, /2 ene 2026, 18:00/)
  assert.doesNotMatch(html, /2026-01-03T/)
  assert.match(html, /Consulta disponibilidad actual/)
  assert.doesNotMatch(html, /DEMO|SIMULAR|userId|feeBps|proofKey|ganador@/)
  const empty = renderToStaticMarkup(<Catalog raffles={[]} />)
  assert.match(empty, /No hay rifas públicas disponibles/)
  assert.doesNotMatch(empty, /Rifa fixture/)
})
