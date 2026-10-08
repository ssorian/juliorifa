import type { PurchaseDTO } from '../../purchases/types'
import { money } from '../../../lib/utils/money'
import { labels } from '../lib/admin'
import { AdminIcon } from './AdminIcon'

export function adminDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(value))
    .replaceAll(' de ', ' ')
}
export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
export function StatusPill({ status }: { status: string }) {
  const color = ['reviewing', 'awaiting_proof'].includes(status)
    ? 'pending'
    : ['rejected', 'expired'].includes(status)
      ? 'cancelled'
      : status
  return (
    <span className={'status-pill ' + color}>{labels[status] ?? status}</span>
  )
}
export function PurchaseRows({
  orders,
  compact = false,
  onSelect,
}: {
  orders: PurchaseDTO[]
  compact?: boolean
  onSelect: (id: string) => void
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>COMPRADOR</th>
            <th>RIFA</th>
            <th>BOLETOS</th>
            <th>IMPORTE</th>
            <th>ESTADO</th>
            {!compact && <th>FECHA</th>}
            <th>
              <span className="sr-only">Detalle</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="purchase-row"
              onClick={() => onSelect(order.id)}
            >
              <td>
                <div className="buyer-cell">
                  <span className="avatar">
                    {initials(order.customer?.name ?? 'Cliente')}
                  </span>
                  <div>
                    <strong>
                      {order.customer?.name ?? 'Cliente no disponible'}
                    </strong>
                    <small title={order.id}>{order.id.slice(0, 8)}</small>
                  </div>
                </div>
              </td>
              <td>
                <span className="table-product">
                  {order.raffleTitle ?? order.raffleId}
                </span>
              </td>
              <td>{order.tickets.length.toLocaleString('es-MX')}</td>
              <td className="money-cell">{money(order.totalCents)}</td>
              <td>
                <StatusPill status={order.status} />
              </td>
              {!compact && <td>{adminDate(order.createdAt)}</td>}
              <td>
                <button
                  className="icon-button"
                  aria-label={`Ver compra ${order.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(order.id)
                  }}
                >
                  <AdminIcon name="eye" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
