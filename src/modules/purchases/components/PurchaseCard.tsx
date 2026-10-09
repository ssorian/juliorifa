import type { PurchaseDTO } from '../types'
import { statusLabel } from '../lib/presentation'
import { money } from '../../../lib/utils/money'
import { formatDate } from '../../../lib/utils/date'

export function PurchaseCard({ purchase: p }: { purchase: PurchaseDTO }) {
  const href = `/mis-compras?id=${p.id}`
  const action = {
    awaiting_proof: 'Ver instrucciones de pago',
    reviewing: 'Consultar revisión',
    paid: 'Ver boletos confirmados',
    cancelled: 'Ver detalle',
    rejected: 'Ver detalle',
    expired: 'Ver detalle',
  }[p.status]
  return (
    <article>
      <h2>
        <a href={href}>Apartado {p.id.slice(0, 8)}</a>
      </h2>
      <p>{p.raffleTitle || `Rifa ${p.raffleId.slice(0, 8)}`}</p>
      <p>{statusLabel(p.status)}</p>
      <p>
        {p.tickets.length} boletos · {money(p.totalCents)} MXN
      </p>
      <p>
        <time dateTime={p.createdAt}>{formatDate(p.createdAt)}</time>
      </p>
      <a className="button secondary" href={href}>
        {action}
      </a>
    </article>
  )
}
