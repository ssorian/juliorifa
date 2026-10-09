import { statusLabel } from '../lib/presentation'
import type { PurchaseDTO } from '../types'

export function PurchaseProgress({ purchase: p }: { purchase: PurchaseDTO }) {
  const terminal = ['cancelled', 'rejected', 'expired'].includes(p.status)
  const current = p.status === 'paid' ? 2 : p.status === 'reviewing' ? 1 : 0
  const labels = [
    'Apartado creado',
    p.status === 'awaiting_proof'
      ? 'Comprobante por enviar'
      : 'Comprobante recibido',
    p.status === 'paid'
      ? 'Pago confirmado'
      : p.status === 'reviewing'
        ? 'Pago por confirmar'
        : 'Pago pendiente',
  ]
  return (
    <section
      className="purchase-progress"
      aria-label="Seguimiento del apartado"
    >
      <h3>Seguimiento del apartado</h3>
      {terminal ? (
        <p className="purchase-terminal">
          {statusLabel(p.status)}: estos boletos no participan.
        </p>
      ) : (
        <ol>
          {labels.map((label, index) => (
            <li
              key={index}
              data-complete={index <= current}
              aria-current={index === current ? 'step' : undefined}
            >
              <span aria-hidden="true">{index + 1}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
