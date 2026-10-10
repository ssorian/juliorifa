import { useState } from 'react'
import type { PurchaseDTO } from '../types'
import { statusLabel } from '../lib/presentation'
import { errorMessage } from '../../raffles/lib/presentation'
import { money } from '../../../lib/utils/money'
import { formatDate } from '../../../lib/utils/date'

export function PurchaseList({ query }: { query: {
  data?: PurchaseDTO[]
  isError: boolean
  isPending: boolean
  error: unknown
  refetch: () => Promise<unknown>
} }) {
  if (query.isError) return (
    <p className="purchase-list-message" role="alert">
      {errorMessage(query.error)}{' '}
      <button onClick={() => void query.refetch()}>Reintentar</button>
    </p>
  )
  if (query.isPending) return (
    <p className="purchase-list-message" role="status">Cargando apartados…</p>
  )
  if (!query.data?.length) return (
    <p className="purchase-list-message">
      No tienes apartados en esta página. <a href="/">Explorar rifas</a>
    </p>
  )
  return (
    <div className="purchase-list">
      {query.data.map(p => <PurchaseCard key={p.id} purchase={p} />)}
    </div>
  )
}

export function PurchaseCard({ purchase: p }: { purchase: PurchaseDTO }) {
  const href = `/mis-compras?id=${p.id}`
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const image = p.raffleImageUrl && failedUrl !== p.raffleImageUrl
  const title = p.raffleTitle || 'Producto no disponible'
  const action = {
    awaiting_proof: 'Ver instrucciones de pago',
    reviewing: 'Consultar revisión',
    paid: 'Ver boletos confirmados',
    cancelled: 'Ver detalle',
    rejected: 'Ver detalle',
    expired: 'Ver detalle',
  }[p.status]
  return (
    <article className="product-card purchase-card">
      <div className="product-image-link purchase-card-image">
        <span className={`product-badge purchase-status purchase-status--${p.status}`}>
          APARTADO · {statusLabel(p.status)}
        </span>
        {image ? <img src={p.raffleImageUrl!} alt={title} loading="lazy"
          onError={() => setFailedUrl(p.raffleImageUrl!)} /> : <span>Imagen no disponible</span>}
      </div>
      <div className="product-card-body purchase-card-body">
        <h2><a href={href}>{title}</a></h2>
        <div className="raffle-meta purchase-card-amount">
          <div className="raffle-price"><strong>{money(p.totalCents)}</strong><small>MXN / total</small></div>
          <div className="raffle-date">Apartado<br />
            <time dateTime={p.createdAt}>{formatDate(p.createdAt)}</time>
          </div>
        </div>
        <p className="purchase-card-reference">
          {p.tickets.length} {p.tickets.length === 1 ? 'boleto' : 'boletos'} · Apartado {p.id.slice(0, 8)}
        </p>
        <a className="button primary" href={href} aria-label={`Ver apartado: ${action} — ${title}`}>
          Ver apartado
        </a>
      </div>
    </article>
  )
}
