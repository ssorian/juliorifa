import { useState, useEffect } from 'react'
import { adminFinancialMetrics } from '../services/backend'
import {
  adminRaffles,
  adminDraw,
  executeDraw,
} from '../../raffles/services/server'
import { useAdminQuery, useAdminAction } from '../hooks/useAdmin'
import { money } from '../../../lib/utils/money'
import { labels } from '../lib/admin'
import { Feedback, Pager, ActionFeedback } from './Feedback'
import { RaffleEditor } from './RaffleEditor'
import { InventoryDialog } from './InventoryDialog'
import { AdminDialog } from './AdminDialog'
import { AdminImage } from './AdminImage'
import type { AdminRaffle } from './RaffleEditor'

export function RafflesTable() {
  const [page, setPage] = useState(0),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<AdminRaffle | null | undefined>(),
    [inventory, setInventory] = useState<AdminRaffle | null>(null),
    [drawing, setDrawing] = useState<AdminRaffle | null>(null)
  const query = useAdminQuery(
    'raffles',
    JSON.stringify([page, search, status]),
    () =>
      adminRaffles({
        data: { offset: page * 20, limit: 20, search, status: status as 'all' },
      }),
  )
  return (
    <>
      <div className="toolbar">
        <input
          aria-label="Buscar rifa"
          placeholder="Buscar título o descripción"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
        <select
          aria-label="Estado de rifa"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(0)
          }}
        >
          {[
            'all',
            'draft',
            'active',
            'scheduled',
            'paused',
            'closed',
            'drawn',
            'archived',
          ].map((s) => (
            <option key={s} value={s}>
              {labels[s] ?? 'Todos'}
            </option>
          ))}
        </select>
        <button className="button primary" onClick={() => setEditing(null)}>
          Crear rifa
        </button>
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
                <th>Rifa</th>
                <th>Estado</th>
                <th>Precio</th>
                <th>Inventario</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.images[0] && (
                      <AdminImage
                        url={r.images[0].mediaUrl}
                        alt={r.images[0].alt}
                      />
                    )}
                    <strong>{r.title}</strong>
                    <small>{r.id}</small>
                  </td>
                  <td>{labels[r.status]}</td>
                  <td>{money(r.priceCents)}</td>
                  <td>
                    {r.startNumber} — {r.startNumber + r.ticketCount - 1}
                  </td>
                  <td>
                    <button onClick={() => setEditing(r)}>
                      Editar / archivar
                    </button>
                    <button onClick={() => setInventory(r)}>
                      Inventario / CSV
                    </button>
                    <button onClick={() => setDrawing(r)}>
                      Sorteo / resultado
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
      {editing !== undefined && (
        <RaffleEditor
          key={editing?.id ?? 'new'}
          raffle={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {inventory && (
        <InventoryDialog
          raffle={inventory}
          onClose={() => setInventory(null)}
        />
      )}
      {drawing && (
        <DrawDialog raffle={drawing} onClose={() => setDrawing(null)} />
      )}
    </>
  )
}
function DrawDialog({
  raffle,
  onClose,
}: {
  raffle: AdminRaffle
  onClose: () => void
}) {
  const [due, setDue] = useState(false)
  useEffect(() => {
    const check = () =>
      setDue(
        Date.now() >= Date.parse(raffle.drawAt) &&
          Date.now() >= Date.parse(raffle.salesDeadline),
      )
    check()
    const timer = window.setInterval(check, 15000)
    return () => window.clearInterval(timer)
  }, [raffle.drawAt, raffle.salesDeadline])
  const readiness = useAdminQuery('finance', raffle.id, () =>
    adminFinancialMetrics({ data: { raffleId: raffle.id } }),
  )
  const result = useAdminQuery('draw', raffle.id, () =>
      adminDraw({ data: { id: raffle.id } }),
    ),
    action = useAdminAction()
  return (
    <AdminDialog label="Sorteo" onClose={onClose} busy={action.busy}>
      <h2>Sorteo: {raffle.title}</h2>
      <button disabled={action.busy} onClick={onClose}>
        Cerrar
      </button>
      <p>
        Solo boletos pagados. El servidor exige fecha correcta, cierre y ninguna
        compra sin resolver. Operación irreversible; nunca se introduce un
        ganador.
      </p>
      <p>Fecha ISO: {raffle.drawAt}</p>
      <Feedback pending={result.isPending} error={result.error} />
      {result.data && (
        <dl>
          {Object.entries(result.data).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      <Feedback error={readiness.error} pending={readiness.isPending} />
      {!due && (
        <p>
          El cierre o la fecha de sorteo aún no se cumplen. El servidor vuelve a
          verificar su reloj al confirmar.
        </p>
      )}
      {readiness.data &&
        (readiness.data.stock.reserved > 0 ||
          readiness.data.stock.reviewing > 0) && (
          <p>
            Hay boletos reservados o en revisión. Resuelve las compras
            pendientes antes del sorteo.
          </p>
        )}
      {readiness.data?.paidTickets === 0 && <p>No hay boletos pagados.</p>}
      <ActionFeedback {...action} />
      {result.data === null &&
        !['draft', 'archived'].includes(raffle.status) && (
          <button
            disabled={
              action.busy ||
              !due ||
              !readiness.data ||
              readiness.data.paidTickets === 0 ||
              readiness.data.stock.reserved > 0 ||
              readiness.data.stock.reviewing > 0
            }
            onClick={() => {
              if (
                window.confirm(
                  `Confirmo el sorteo irreversible de ${raffle.title}, solo boletos pagados. El resultado original se conservará en reintentos.`,
                )
              )
                void action.run(
                  () => executeDraw({ data: { id: raffle.id } }),
                  'Ganador registrado. Notificación encolada, no enviada todavía.',
                )
            }}
          >
            Confirmar sorteo irreversible
          </button>
        )}
      <button
        onClick={() => {
          void result.refetch()
          void readiness.refetch()
        }}
      >
        Actualizar resultado
      </button>
    </AdminDialog>
  )
}
