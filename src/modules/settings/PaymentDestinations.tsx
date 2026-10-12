import { useState } from 'react'
import { methodLabels } from './domain'
import type { PaymentMethod } from './domain'

export function PaymentDestinations({
  methods,
  reference,
}: {
  methods: PaymentMethod[]
  reference: string
}) {
  const [notice, setNotice] = useState('')
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice('Copiado')
    } catch {
      setNotice('No se pudo copiar. Selecciona el texto manualmente.')
    }
  }
  return (
    <section className="payment-snapshot" aria-label="Destinos guardados">
      <h3>Destinos guardados en tu apartado</h3>
      <p>
        Elige uno de estos destinos para transferir el importe total. Subir el
        comprobante no confirma el pago.
      </p>
      {!methods.length && (
        <p>No hay destinos bancarios guardados para este apartado.</p>
      )}
      {methods.map((method) => (
        <article key={method.id} className="payment-destination">
          <h4>
            {methodLabels[method.type]} · {method.bank}
          </h4>
          <dl>
            <dt>Beneficiario</dt>
            <dd>{method.beneficiary}</dd>
            <dt>{methodLabels[method.type]}</dt>
            <dd>
              <code>{method.number}</code>
            </dd>
            {method.instructions && (
              <>
                <dt>Instrucciones</dt>
                <dd>{method.instructions}</dd>
              </>
            )}
          </dl>
          <button type="button" onClick={() => void copy(method.number)}>
            Copiar {methodLabels[method.type]}
          </button>
        </article>
      ))}
      <p>
        Referencia de apartado: <code>{reference}</code>
      </p>
      <button type="button" onClick={() => void copy(reference)}>
        Copiar referencia
      </button>
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
