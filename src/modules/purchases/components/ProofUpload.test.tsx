import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProofUpload } from './ProofUpload'

test('SSR offers local selection without an implicit submit or object URL', () => {
  const html = renderToStaticMarkup(
    <ProofUpload busy={false} onSend={async () => true} />,
  )
  assert.match(html, /type="file"/)
  assert.match(html, /application\/pdf/)
  assert.doesNotMatch(html, /blob:|Enviar comprobante|<img/)
})

test('busy disables selection', () => {
  assert.match(
    renderToStaticMarkup(<ProofUpload busy onSend={async () => true} />),
    /disabled=""/,
  )
})
