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
import { AdminIcon } from './AdminIcon'
import { StatusPill, adminDate } from './PurchaseRows'
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
  const metrics = useAdminQuery('finance', '', () =>
    adminFinancialMetrics({ data: {} }),
  )
  return (
    <>
      <div className="toolbar">
        <div className="search-control">
          <AdminIcon name="search" />
          <input
            aria-label="Buscar rifa"
            placeholder="Buscar producto o rifa"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
          />
        </div>
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
        <span className="toolbar-note">
          {query.data?.length ?? '—'} rifas en esta página
        </span>
      </div>
      <section className="panel">
        <Feedback
          pending={query.isPending}
          error={query.error}
          empty={query.data?.length === 0}
        />
        {query.data && (
          <div className="table-scroll">
            <table className="raffle-table">
              <thead>
                <tr>
                  <th>PRODUCTO</th>
                  <th>ESTADO</th>
                  <th>FECHA DEL SORTEO</th>
                  <th>PRECIO / BOLETO</th>
                  <th>DISPONIBILIDAD</th>
                  <th>INGRESOS COBRADOS</th>
                  <th>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((r) => {
                  const metric = metrics.data?.raffles.find(
                    (item) => item.id === r.id,
                  )
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="raffle-product">
                          <AdminImage
                            url={r.images[0]?.mediaUrl}
                            alt={r.title}
                          />
                          <div>
                            <strong>{r.title}</strong>
                            <small>
                              {r.features[0]
                                ? `${r.features[0].title} · ${r.features[0].description}`
                                : 'Producto personalizado'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td>{adminDate(r.drawAt)}</td>
                      <td className="money-cell">{money(r.priceCents)}</td>
                      <td className="ticket-breakdown">
                        <strong>
                          {metric?.stock.available.toLocaleString('es-MX') ??
                            '—'}{' '}
                          disponibles
                        </strong>
                        <small>
                          {metric?.stock.sold.toLocaleString('es-MX') ?? '—'}{' '}
                          vendidos ·{' '}
                          {metric
                            ? (
                                metric.stock.reserved + metric.stock.reviewing
                              ).toLocaleString('es-MX')
                            : '—'}{' '}
                          reservados
                        </small>
                        <div className="mini-progress">
                          <span
                            style={{
                              width: `${((metric?.stock.sold ?? 0) / r.ticketCount) * 100}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="money-cell">
                        {metric ? money(metric.paidCents) : '—'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={`Editar ${r.title}`}
                            onClick={() => setEditing(r)}
                          >
                            <AdminIcon name="edit" />
                          </button>
                          <button
                            className="button ghost"
                            onClick={() => setInventory(r)}
                          >
                            Boletos
                          </button>
                          <button
                            className="text-button"
                            onClick={() => setDrawing(r)}
                          >
                            Sorteo
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={page}
          setPage={setPage}
          hasNext={query.data?.length === 20}
        />
      </section>
      <Feedback error={metrics.error} />
      <p className="section-note">
        Los cambios se guardan en servidor. Los boletos reservados aún no
        cuentan como vendidos; las compras históricas conservan su precio
        original.
      </p>
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
                  'Ganador registrado. Resultado y auditoría conservados.',
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
