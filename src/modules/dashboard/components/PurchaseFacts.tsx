import type { PurchaseDTO } from '../../purchases/types'
import { money } from '../../../lib/utils/money'
import { labels } from '../lib/admin'

export function PurchaseFacts({ order }: { order: PurchaseDTO }) {
  return (
    <>
      <p>{labels[order.status]}</p>
      <p>
        {order.customer?.name} · {order.customer?.email}
      </p>
      <dl>
        <dt>Rifa</dt>
        <dd>{order.raffleId}</dd>
        <dt>Boletos</dt>
        <dd>{order.tickets.join(', ')}</dd>
        <dt>Precio snapshot × cantidad</dt>
        <dd>
          {money(order.priceCents)} × {order.tickets.length}
        </dd>
        <dt>Importe bancario snapshot</dt>
        <dd>{money(order.totalCents)}</dd>
        <dt>Fee histórico (gasto admin)</dt>
        <dd>
          {money(order.feeCents)} ({order.feeBps} bps), sin recargo comprador
        </dd>
        <dt>Creada</dt>
        <dd>{order.createdAt}</dd>
        <dt>Plazo comprobante</dt>
        <dd>{order.expiresAt}</dd>
        <dt>Comprobante recibido</dt>
        <dd>{order.proofReceivedAt ?? 'No recibido'}</dd>
        <dt>Revisión</dt>
        <dd>{order.reviewedAt ?? 'Sin revisión'}</dd>
      </dl>
      <h3>Instrucciones bancarias de esta compra (inmutables)</h3>
      {order.paymentInstructions ? (
        <dl>
          {Object.entries(order.paymentInstructions).map(([key, v]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>
          Histórico sin snapshot bancario. No se reemplaza con la cuenta actual.
        </p>
      )}
    </>
  )
}
