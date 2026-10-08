import { useState } from 'react'
import {
  adminPurchases,
  adminPurchase,
  purchaseAudit,
  cancelAdminReservation,
} from '../../purchases/server'
import { useAdminQuery, useAdminAction } from '../hooks/useAdmin'
import { canReview, labels } from '../lib/admin'
import { money } from '../../../lib/utils/money'
import { Feedback, Pager, ActionFeedback } from './Feedback'
import { RaffleFilter } from './RaffleFilter'
import { AdminDialog } from './AdminDialog'
import { PurchaseFacts } from './PurchaseFacts'
import { PurchaseRows, StatusPill, initials } from './PurchaseRows'
import { AdminIcon } from './AdminIcon'
import { ProofPreview } from './ProofPreview'

export function OrdersTable() {
  const [page, setPage] = useState(0),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [raffleId, setRaffle] = useState(''),
    [selected, setSelected] = useState<string | null>(null)
  const query = useAdminQuery(
    'purchases',
    JSON.stringify([page, search, status, raffleId]),
    () =>
      adminPurchases({
        data: {
          offset: page * 8,
          limit: 8,
          search,
          status: status as 'all',
          raffleId: raffleId || undefined,
        },
      }),
  )
  return (
    <>
      <div className="toolbar">
        <div className="search-control">
          <AdminIcon name="search" />
          <input
            aria-label="Buscar compra"
            placeholder="Nombre, correo o folio"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <select
          aria-label="Estado de compra"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(0)
          }}
        >
          {[
            'all',
            'awaiting_proof',
            'reviewing',
            'paid',
            'rejected',
            'expired',
            'cancelled',
          ].map((s) => (
            <option key={s} value={s}>
              {labels[s] ?? 'Todos'}
            </option>
          ))}
        </select>
        <RaffleFilter
          value={raffleId}
          onChange={(id) => {
            setRaffle(id)
            setPage(0)
          }}
        />
      </div>
      <section className="panel">
        <Feedback
          pending={query.isPending}
          error={query.error}
          empty={query.data?.length === 0}
        />
        {query.data && (
          <PurchaseRows orders={query.data} onSelect={setSelected} />
        )}
        <Pager
          page={page}
          setPage={setPage}
          hasNext={query.data?.length === 8}
        />
      </section>
      <p className="section-note">
        Confirma los pagos desde el detalle de cada compra. Cancelar una compra
        en revisión libera sus boletos; los pagos confirmados forman parte de
        los ingresos cobrados.
      </p>
      {selected && (
        <PurchaseDialog
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
export function PurchaseDialog({
  id,
  onClose,
}: {
  id: string
  onClose: () => void
}) {
  const query = useAdminQuery('purchase', id, () =>
      adminPurchase({ data: { id } }),
    ),
    audit = useAdminQuery('audit', id, () => purchaseAudit({ data: { id } })),
    action = useAdminAction()
  const [reason, setReason] = useState('')
  const order = query.data
  async function review(target: 'approve' | 'reject') {
    if (!order || !canReview(order) || !order.proofVerified || !reason.trim())
      return
    if (
      !window.confirm(
        `${target === 'approve' ? 'APROBAR' : 'RECHAZAR'} compra ${id}. Importe snapshot ${money(order.totalCents)}, banco ${order.paymentInstructions?.bank ?? 'No disponible'}. ${target === 'reject' ? 'Se liberarán los boletos.' : 'Solo confirmo tras verificar la transferencia y el comprobante.'}`,
      )
    )
      return
    await action.run(
      async () => {
        const response = await fetch(`/api/purchases/${id}/${target}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() }),
        })
        const result = await response.json()
        if (!response.ok)
          throw new Error(result.error ?? 'No se pudo revisar la compra.')
        if (result.status !== (target === 'approve' ? 'paid' : 'rejected'))
          throw new Error(
            `El servidor conserva estado ${result.status}. Actualiza el detalle.`,
          )
        setReason('')
        return result
      },
      target === 'approve'
        ? 'Pago confirmado en servidor.'
        : 'Compra cancelada y boletos liberados. Historia conservada.',
    )
  }
  return (
    <AdminDialog label="Detalle de compra" onClose={onClose} busy={action.busy}>
      <div className="dialog-header">
        <div>
          <p className="small-eyebrow">// DETALLE DE COMPRA</p>
          <h2>Compra {id.slice(0, 8)}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar compra"
          disabled={action.busy}
          onClick={onClose}
        >
          <AdminIcon name="close" />
        </button>
      </div>
      <Feedback pending={query.isPending} error={query.error} />
      {order && (
        <>
          <div className="purchase-intro">
            <span className="avatar">
              {initials(order.customer?.name ?? 'Cliente')}
            </span>
            <div>
              <strong>{order.customer?.name ?? 'Cliente no disponible'}</strong>
              <small>{order.customer?.email}</small>
            </div>
            <StatusPill status={order.status} />
          </div>
          {order.proofVerified && <ProofPreview key={id} id={id} />}
          <details>
            <summary>Detalles de la compra e instrucciones de pago</summary>
            <PurchaseFacts order={order} />
          </details>
          {order.status === 'awaiting_proof' && (
            <>
              <label>
                Motivo obligatorio
                <textarea
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={action.busy || !reason.trim()}
                onClick={() => {
                  if (
                    window.confirm(
                      'Cancelar esta reserva y liberar sus boletos?',
                    )
                  )
                    void action.run(async () => {
                      const result = await cancelAdminReservation({
                        data: { id, reason: reason.trim() },
                      })
                      if (!['cancelled', 'expired'].includes(result.status))
                        throw new Error(
                          'El servidor no confirmó la cancelación.',
                        )
                      setReason('')
                      return result
                    }, 'Reserva cancelada o vencida; boletos liberados.')
                }}
              >
                Cancelar reserva y liberar boletos
              </button>
            </>
          )}
          {canReview(order) && order.proofVerified && (
            <>
              <label>
                Motivo obligatorio
                <textarea
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={action.busy || !reason.trim()}
                onClick={() => void review('approve')}
              >
                Confirmar pago
              </button>
              <button
                disabled={action.busy || !reason.trim()}
                className="button secondary"
                onClick={() => void review('reject')}
              >
                Cancelar compra y liberar boletos
              </button>
            </>
          )}
        </>
      )}
      <h3>Historia</h3>
      <Feedback
        pending={audit.isPending}
        error={audit.error}
        empty={audit.data?.length === 0}
      />
      <ul>
        {audit.data?.map((event, i) => (
          <li key={i}>
            {event.createdAt} · {event.type} · {event.reason ?? 'Sin motivo'}
          </li>
        ))}
      </ul>
      <ActionFeedback {...action} />
      <button
        onClick={() => {
          void query.refetch()
          void audit.refetch()
        }}
      >
        Actualizar
      </button>
    </AdminDialog>
  )
}
