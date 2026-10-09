import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { DrawStatus } from './DrawStatus'

const past = '2020-01-01T00:00:00Z'
const now = Date.parse('2026-01-01')
test('draw distinguishes query outcomes and a neutral SSR clock', () => {
  const render = (props: Partial<Parameters<typeof DrawStatus>[0]>) =>
    renderToStaticMarkup(
      <DrawStatus
        drawAt={past}
        result={null}
        isSuccess={true}
        isError={false}
        {...props}
      />,
    )
  assert.doesNotMatch(render({}), /Sorteo pendiente/)
  assert.match(render({ now, isSuccess: false }), /Consultando resultado/)
  assert.doesNotMatch(
    render({ now, isError: true, isSuccess: false }),
    /Sorteo pendiente|Boleto ganador/,
  )
  assert.doesNotMatch(render({ now, result: undefined }), /Sorteo pendiente/)
  assert.match(render({ now }), /Sorteo pendiente/)
  assert.match(render({ now, drawAt: '2099-01-01' }), /Sorteo programado/)
  assert.doesNotMatch(
    render({ now, drawAt: 'invalid' }),
    /Sorteo pendiente|Sorteo programado/,
  )
  assert.match(render({ now }), /cuando está habilitada/)
})
test('real immutable result preserves ticket zero and actual date even on background error', () => {
  const result = {
    winnerTicket: 0,
    drawnAt: '2020-01-02T00:00:00Z',
  } as NonNullable<Parameters<typeof DrawStatus>[0]['result']>
  const html = renderToStaticMarkup(
    <DrawStatus
      drawAt={past}
      result={result}
      isSuccess={false}
      isError={true}
    />,
  )
  assert.match(html, /Boleto ganador: 0/)
  assert.match(html, /Realizado el: 1 ene 2020/)
  assert.match(html, /No pudimos consultar/)
  assert.doesNotMatch(html, /Sorteo pendiente/)
})
