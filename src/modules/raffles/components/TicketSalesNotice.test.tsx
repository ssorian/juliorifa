import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { TicketSalesNotice } from './TicketSalesNotice'

test('terminal notices distinguish closure and exhaustion and link to the catalogue', () => {
  for (const [state, title] of [['closed', 'Esta rifa ha finalizado'], ['sold-out', 'Boletos agotados']] as const) {
    const html = renderToStaticMarkup(<TicketSalesNotice state={state} />)
    assert.match(html, new RegExp(`<h2>${title}</h2>`))
    assert.match(html, /No es posible comprar boletos/)
    assert.match(html, /href="\/"[^>]*>Sigue participando en otra rifa/)
    assert.doesNotMatch(html, /<button|<input|<form|<details/)
  }
})
