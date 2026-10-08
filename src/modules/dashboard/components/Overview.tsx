import { useState } from 'react'
import { adminFinancialMetrics } from '../services/backend'
import { adminRaffles } from '../../raffles/services/server'
import { adminPurchases } from '../../purchases/server'
import { useAdminQuery } from '../hooks/useAdmin'
import { Feedback } from './Feedback'
import { MetricCards } from './MetricCards'
import { RaffleFilter } from './RaffleFilter'
import { RevenueChart } from './RevenueChart'
import { AdminImage } from './AdminImage'
import { AdminIcon } from './AdminIcon'
import { RaffleEditor } from './RaffleEditor'
import type { AdminRaffle } from './RaffleEditor'
import { PurchaseRows } from './PurchaseRows'
import { PurchaseDialog } from './Purchases'

export function Overview() {
  const [raffleId, setRaffle] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminRaffle | null>(null)
  const query = useAdminQuery('finance', raffleId, () =>
    adminFinancialMetrics({ data: { raffleId: raffleId || undefined } }),
  )
  const raffles = useAdminQuery('raffles', 'overview', () =>
    adminRaffles({ data: { offset: 0, limit: 100 } }),
  )
  const orders = useAdminQuery('purchases', 'recent:' + raffleId, () =>
    adminPurchases({
      data: { offset: 0, limit: 5, raffleId: raffleId || undefined },
    }),
  )
  const data = query.data
  const list = raffles.data?.filter((r) => !raffleId || r.id === raffleId) ?? []
  return (
    <>
      <div className="toolbar">
        <RaffleFilter value={raffleId} onChange={setRaffle} />
        <span className="toolbar-note">Métricas acumuladas · MXN</span>
      </div>
      <Feedback pending={query.isPending} error={query.error} />
      {data && (
        <>
          <MetricCards data={data} />
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Actividad de ingresos</h2>
                  <p>El pulso de tus ventas</p>
                </div>
                <span className="status-pill scheduled">14 días</span>
              </div>
              <RevenueChart chart={data.chart} />
              {data.unknownApprovalCount > 0 && (
                <p className="finance-note">
                  {data.unknownApprovalCount} pagos históricos sin fecha de
                  aprobación se incluyen en el total, no en la gráfica.
                </p>
              )}
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Rifas en operación</h2>
                  <p>
                    {data.raffles.filter((r) => r.status === 'active').length}{' '}
                    activas de {data.raffleCount} rifas
                  </p>
                </div>
                <a className="text-button" href="#rifas">
                  Ver todas
                </a>
              </div>
              <Feedback
                pending={raffles.isPending}
                error={raffles.error}
                empty={list.length === 0}
              />
              {list.slice(0, 3).map((raffle) => {
                const stock = data.raffles.find(
                  (r) => r.id === raffle.id,
                )?.stock
                const sold = stock?.sold ?? 0
                return (
                  <article className="mini-raffle" key={raffle.id}>
                    <AdminImage
                      url={raffle.images[0]?.mediaUrl}
                      alt={raffle.title}
                    />
                    <div className="mini-raffle-info">
                      <h3>{raffle.title}</h3>
                      <div className="mini-raffle-meta">
                        <span>
                          {sold.toLocaleString('es-MX')} /{' '}
                          {raffle.ticketCount.toLocaleString('es-MX')} vendidos
                        </span>
                        <span>
                          {((sold / raffle.ticketCount) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="mini-progress">
                        <span
                          style={{
                            width: `${(sold / raffle.ticketCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Editar ${raffle.title}`}
                      onClick={() => setEditing(raffle)}
                    >
                      <AdminIcon name="edit" />
                    </button>
                  </article>
                )
              })}
            </section>
          </div>
        </>
      )}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Compras recientes</h2>
            <p>Consulta quién participa y el estado de cada pago</p>
          </div>
          <a className="text-button" href="#compras">
            Ver todas las compras
          </a>
        </div>
        <Feedback
          pending={orders.isPending}
          error={orders.error}
          empty={orders.data?.length === 0}
        />
        {orders.data && (
          <PurchaseRows orders={orders.data} compact onSelect={setSelected} />
        )}
        <div className="panel-footer">
          <span>Datos actuales del servidor</span>
          <span>{data?.pendingOrders ?? '—'} compras pendientes de pago</span>
        </div>
      </section>
      {selected && (
        <PurchaseDialog
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
      {editing && (
        <RaffleEditor raffle={editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
