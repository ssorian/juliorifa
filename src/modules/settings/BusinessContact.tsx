import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminQuery, useAdminAction } from '../dashboard/hooks/useAdmin'
import { Feedback } from '../dashboard/components/Feedback'
import { contactInput } from './contact-domain'
import type { BusinessContact as Contact } from './contact-domain'
import { adminBusinessContact, saveBusinessContact } from './contact-server'
import { publicContactKey } from './PublicBusinessContact'

function ContactEditor({ contact }: { contact: Contact }) {
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(contact.whatsapp ?? '')
  const [invalid, setInvalid] = useState(false)
  const action = useAdminAction()
  const client = useQueryClient()

  function save(event: React.FormEvent) {
    event.preventDefault()
    const input = { phone, whatsapp }
    if (!contactInput.safeParse(input).success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    void action.run(async () => {
      const saved = await saveBusinessContact({ data: input })
      await client.invalidateQueries({ queryKey: publicContactKey })
      return saved
    }, 'Contacto guardado')
  }

  return (
    <form onSubmit={save}>
      <p>
        Estos números serán públicos. Usa + y código de país (8–15 dígitos).
        Deja un campo vacío para deshabilitar ese canal.
      </p>
      <label>
        Teléfono del negocio (opcional)
        <input
          type="tel"
          maxLength={40}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label>
        WhatsApp del negocio (opcional)
        <input
          type="tel"
          maxLength={40}
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
        />
      </label>
      <p>WhatsApp abre un contacto manual; no envía mensajes automáticamente.</p>
      {invalid && (
        <p role="alert">Usa números internacionales válidos con + y 8–15 dígitos.</p>
      )}
      {action.error && <p role="alert">{action.error}</p>}
      {action.notice && <p role="status">{action.notice}</p>}
      <button className="button" disabled={action.busy}>Guardar contacto</button>
    </form>
  )
}

export function BusinessContactSettings() {
  const query = useAdminQuery('business-contact', '', () =>
    adminBusinessContact({ data: {} }),
  )
  return (
    <section aria-label="Contacto público del negocio">
      <h2>Contacto público del negocio</h2>
      <Feedback pending={query.isPending} error={query.error} />
      {query.data && <ContactEditor contact={query.data} />}
    </section>
  )
}
