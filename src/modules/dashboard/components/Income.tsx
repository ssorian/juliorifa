import { useState } from 'react'
import { adminFinancialMetrics } from '../services/backend'
import { useAdminQuery } from '../hooks/useAdmin'
import { money } from '../../../lib/utils/money'
import { Feedback } from './Feedback'
import { RaffleFilter } from './RaffleFilter'
import { RevenueChart } from './RevenueChart'

export function Income() {
  const [raffleId, setRaffle] = useState('')
  const query = useAdminQuery('finance', raffleId, () =>
    adminFinancialMetrics({ data: { raffleId: raffleId || undefined } }),
  )
  const data = query.data
  return (
    <>
      <RaffleFilter value={raffleId} onChange={setRaffle} />
      <Feedback pending={query.isPending} error={query.error} />
      {data && (
        <>
          <section className="metric-grid">
            {[
              ['Cobrado confirmado', money(data.paidCents)],
              ['En revisión (no cobrado)', money(data.reviewingCents)],
              ['Fee histórico gasto admin', money(data.feeExpenseCents)],
              ['Costo premios', money(data.prizeCostCents)],
              ['Otros gastos', money(data.expensesCents)],
              ['Resultado neto', money(data.resultCents)],
              ['Compras pagadas', String(data.paidOrders)],
              ['Boletos pagados', String(data.paidTickets)],
            ].map(([label, value]) => (
              <article className="panel metric-card" key={label}>
                <h3>{label}</h3>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <p>
            Precio y fee de cada compra son snapshots. El fee no es un recargo
            al comprador. Pendiente en revisión es distinto del dinero cobrado.
          </p>
          <section className="panel">
            <h2>Inventario actual</h2>
            <p>{data.raffleCount} rifas</p>
            <dl>
              {Object.entries(data.stock).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <RevenueChart chart={data.chart} />
            {data.unknownApprovalCount > 0 && (
              <p>
                Hay {data.unknownApprovalCount} pagos históricos sin fecha de
                aprobación; incluidos en total, no inventados en gráfica.
              </p>
            )}
          </section>
        </>
      )}
    </>
  )
}
