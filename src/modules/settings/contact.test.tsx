import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { contactInput, contactDTO } from './contact-domain'
import { ContactLinks } from './ContactLinks'

test('business contact normalizes optional numbers and rejects unsafe or extra input', () => {
  assert.deepEqual(contactInput.parse({ phone: '', whatsapp: '+52 (55) 1234-5678' }), {
    phone: null, whatsapp: '+525512345678',
  })
  for (const phone of ['5512345678', '+012345678', '+1234567', '+1234567890123456', 'javascript:alert(1)']) {
    assert.equal(contactInput.safeParse({ phone, whatsapp: '' }).success, false)
  }
  assert.equal(contactInput.safeParse({ phone: '', whatsapp: '', updatedBy: 'admin' }).success, false)
  assert.deepEqual(contactDTO({ phone: null, whatsapp: null, updatedBy: 'private' } as never), { phone: null, whatsapp: null })
  assert.deepEqual(contactDTO(undefined), { phone: null, whatsapp: null })
})

test('public contact SSR hides disabled channels and renders safe manual links', () => {
  assert.equal(renderToStaticMarkup(<ContactLinks contact={{ phone: null, whatsapp: null }} />), '')
  const html = renderToStaticMarkup(<ContactLinks contact={{ phone: '+525512345678', whatsapp: '+525587654321' }} />)
  assert.match(html, /tel:\+525512345678/)
  assert.match(html, /https:\/\/wa.me\/525587654321/)
  assert.match(html, /noopener noreferrer/)
  assert.match(html, /referrerPolicy="no-referrer"/)
  assert.match(html, /Contacto del negocio/)
  assert.doesNotMatch(html, /enviado|entregado/)
  const phoneOnly = renderToStaticMarkup(<ContactLinks contact={{ phone: '+12345678', whatsapp: null }} />)
  assert.match(phoneOnly, /tel:\+12345678/)
  assert.doesNotMatch(phoneOnly, /wa.me/)
  const whatsappOnly = renderToStaticMarkup(<ContactLinks contact={{ phone: null, whatsapp: '+123456789012345' }} />)
  assert.match(whatsappOnly, /wa.me\/123456789012345/)
  assert.doesNotMatch(whatsappOnly, /href="tel:/)
  assert.equal(renderToStaticMarkup(<ContactLinks contact={{ phone: 'javascript:alert(1)', whatsapp: 'https://evil.invalid' }} />), '')
})
