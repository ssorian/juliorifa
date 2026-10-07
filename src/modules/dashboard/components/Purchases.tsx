import { useState } from 'react'
import {
  adminPurchases,
  adminPurchase,
  purchaseAudit,
} from '../../purchases/server'
import { useAdminQuery, useAdminAction } from '../hooks/useAdmin'
import { canReview, labels } from '../lib/admin'
import { money } from '../../../lib/utils/money'
import { Feedback, Pager, ActionFeedback } from './Feedback'
import { RaffleFilter } from './RaffleFilter'
import { AdminDialog } from './AdminDialog'
import { PurchaseFacts } from './PurchaseFacts'

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
          offset: page * 20,
          limit: 20,
          search,
          status: status as 'all',
          raffleId: raffleId || undefined,
        },
      }),
  )
  return (
    <>
      <div className="toolbar">
        <input
          aria-label="Buscar compra"
          placeholder="Nombre, correo o UUID"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
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
          <table>
            <thead>
              <tr>
                <th>Compra / cliente</th>
                <th>Estado</th>
                <th>Importe snapshot</th>
                <th>Fecha</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.id}
                    <br />
                    {o.customer?.name ?? 'Cliente no disponible'}
                    <br />
                    {o.customer?.email}
                  </td>
                  <td>{labels[o.status]}</td>
                  <td>
                    {money(o.totalCents)} · {o.tickets.length} boletos
                  </td>
                  <td>{o.createdAt}</td>
                  <td>
                    <button onClick={() => setSelected(o.id)}>
                      Inspeccionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager
          page={page}
          setPage={setPage}
          hasNext={query.data?.length === 20}
        />
      </section>
      {selected && (
        <PurchaseDialog id={selected} onClose={() => setSelected(null)} />
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
        ? 'Pago confirmado. Notificación encolada; no implica correo enviado.'
        : 'Compra rechazada y boletos liberados. Historia conservada. Notificación encolada.',
    )
  }
  return (
    <AdminDialog label="Detalle de compra" onClose={onClose} busy={action.busy}>
      <h2>Compra {id}</h2>
      <button disabled={action.busy} onClick={onClose}>
        Cerrar
      </button>
      <Feedback pending={query.isPending} error={query.error} />
      {order && (
        <>
          <PurchaseFacts order={order} />
          {order.proofVerified && (
            <a
              href={`/api/media/proofs/${id}`}
              target="_blank"
              rel="noreferrer"
            >
              Descargar comprobante privado (sin vista PDF incrustada)
            </a>
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
                disabled={action.busy || !reason.trim()}
                onClick={() => void review('approve')}
              >
                Confirmar transferencia y aprobar
              </button>
              <button
                disabled={action.busy || !reason.trim()}
                onClick={() => void review('reject')}
              >
                Rechazar y liberar boletos
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
