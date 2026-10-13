import { normalizePhone } from '../auth/lib/phone'
import type { BusinessContact } from './contact-domain'

export function ContactLinks({ contact }: { contact: BusinessContact }) {
  const phone = normalizePhone(contact.phone)
  const whatsapp = normalizePhone(contact.whatsapp)
  if (!phone && !whatsapp) return null
  return (
    <section aria-label="Contacto del negocio" className="business-contact-links">
      <h2>Contacto del negocio</h2>
      {phone && (
        <p><a href={`tel:${phone}`}>Llamar: {phone}</a></p>
      )}
      {whatsapp && (
        <p>
          <a
            href={`https://wa.me/${whatsapp.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            WhatsApp: {whatsapp}
          </a>
          {' '}· Contacto manual
        </p>
      )}
    </section>
  )
}
