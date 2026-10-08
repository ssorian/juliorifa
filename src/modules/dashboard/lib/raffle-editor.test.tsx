import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editorSummary, statusLabel } from './raffle-editor'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RaffleEditorPreview } from '../components/RaffleEditorPreview'

test('editor range and live financial preview use real inputs', () => {
  assert.deepEqual(editorSummary('25', '10000', '0', '100', '50'), {
    range: '0000 — 9999',
    count: 10000,
    gross: 250000,
    costs: 150,
  })
  assert.equal(editorSummary('', '0', '-1', '', '').range, 'Rango inválido')
  assert.equal(editorSummary('2', '3', '9', '0', '0').range, '09 — 11')
})
test('SSR preview is honest without an asset and reflects supplied image and fields', () => {
  const fields = {
    title: '',
    description: '',
    status: 'draft',
    price: '25',
    count: '10000',
    start: '0',
    cost: '0',
    expenses: '0',
  }
  const empty = renderToStaticMarkup(
    createElement(RaffleEditorPreview, { fields }),
  )
  assert.match(empty, /Sin imagen seleccionada/)
  assert.doesNotMatch(empty, /<img/)
  assert.match(empty, /Borrador/)
  const real = renderToStaticMarkup(
    createElement(RaffleEditorPreview, {
      fields: { ...fields, title: 'Premio real', status: 'active' },
      image: { url: 'blob:local-real-file', alt: 'real.png' },
    }),
  )
  assert.match(real, /blob:local-real-file/)
  assert.match(real, /Premio real/)
  assert.match(real, /Activa/)
})
test('backend states have human labels without changing values', () => {
  assert.equal(statusLabel('draft'), 'Borrador')
  assert.equal(statusLabel('active'), 'Activa')
  assert.equal(statusLabel('archived'), 'Archivada')
})
