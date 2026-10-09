import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmailAccess } from './EmailAccess'

test('public password controls enforce length and correct autocomplete without role input', () => {
  for (const signup of [false, true]) {
    const html = renderToStaticMarkup(
      <EmailAccess signup={signup} checkout={'a'.repeat(32)} />,
    )
    assert.match(html, /class="nova-auth"/)
    assert.match(html, /class="nova-auth-card"/)
    assert.match(html, /aria-label="NOVA Rifas · Catálogo público"/)
    assert.match(html, /NOVA<small>RIFAS<\/small>/)
    assert.doesNotMatch(html, /✳/)
    assert.match(html, /aria-labelledby="nova-auth-title"/)
    assert.match(html, /role="status" aria-live="polite"/)
    assert.match(
      html,
      /La recuperación de contraseña y la verificación por correo no están disponibles/,
    )
    assert.match(
      html,
      new RegExp(`href="${signup ? '/login' : '/signin'}\\?checkout=`),
    )
    assert.match(html, /\/\/ ACCESS/)
    assert.match(html, /type="email"/)
    assert.match(html, /type="password"/)
    assert.match(html, new RegExp(`minLength="${signup ? 12 : 1}"`))
    if (signup) {
      assert.equal((html.match(/minLength="12"/g) || []).length, 2)
      assert.match(html, /12 a 128 caracteres/)
    } else {
      assert.doesNotMatch(html, /minLength="12"|12 a 128 caracteres|type="tel"/)
    }
    assert.match(html, /maxLength="128"/)
    assert.match(
      html,
      new RegExp(`autoComplete="${signup ? 'new' : 'current'}-password"`),
    )
    assert.doesNotMatch(
      html,
      /name="role"|value="admin"|Sin contraseña|enlace de acceso|Demo local/,
    )
    assert.match(html, /checkout=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/)
    if (signup) {
      assert.match(html, /autoComplete="name"/)
      assert.match(html, /Confirmar contraseña/)
      assert.match(html, /type="tel" required=""/)
      assert.match(html, /autoComplete="tel"/)
    }
  }
})
test('SSR alternate access link discards unsafe callback and gives generic session error', () => {
  const html = renderToStaticMarkup(
    <EmailAccess checkout="//evil.test" error="session" />,
  )
  assert.doesNotMatch(html, /evil\.test|ha caducado/)
  assert.match(html, /No pudimos completar el acceso/)
})
