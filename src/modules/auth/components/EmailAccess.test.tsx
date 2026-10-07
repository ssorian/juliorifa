import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmailAccess } from './EmailAccess'

test('public login/signup SSR never includes passwords or role inputs', () => {
  for (const signup of [false, true]) {
    const html = renderToStaticMarkup(
      <EmailAccess signup={signup} checkout={'a'.repeat(32)} />,
    )
    assert.match(html, /type="email"/)
    assert.doesNotMatch(html, /type="password"|name="role"|value="admin"/)
    assert.match(html, /checkout=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/)
    assert.match(html, /automáticamente una cuenta cliente/)
  }
})
test('SSR alternate access link discards unsafe callback values', () => {
  const html = renderToStaticMarkup(
    <EmailAccess checkout="//evil.test" error="link" />,
  )
  assert.doesNotMatch(html, /evil\.test/)
  assert.match(html, /ha caducado/)
})
