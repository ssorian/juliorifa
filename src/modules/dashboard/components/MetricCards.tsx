import { money } from '../../../lib/utils/money'
import { AdminIcon } from './AdminIcon'

export interface Metrics {
  paidCents: number
  pendingCents: number
  pendingOrders: number
  pendingTickets: number
  paidOrders: number
  paidTickets: number
  resultCents: number
}
export function MetricCards({ data }: { data: Metrics }) {
  return (
    <div className="metric-grid">
      <article className="metric-card emphasis">
        <div className="metric-top">
          <span>Ingresos cobrados</span>
          <span className="metric-icon">
            <AdminIcon name="coins" />
          </span>
        </div>
        <strong>{money(data.paidCents)}</strong>
        <p>{data.paidOrders} compras pagadas · MXN</p>
      </article>
      <article className="metric-card">
        <div className="metric-top">
          <span>Pagos pendientes</span>
          <span className="metric-icon">
            <AdminIcon name="clock" />
          </span>
        </div>
        <strong>{money(data.pendingCents)}</strong>
        <p>{data.pendingOrders} compras por confirmar</p>
      </article>
      <article className="metric-card">
        <div className="metric-top">
          <span>Boletos vendidos</span>
          <span className="metric-icon">
            <AdminIcon name="ticket" />
          </span>
        </div>
        <strong>{data.paidTickets.toLocaleString('es-MX')}</strong>
        <p>
          {data.pendingTickets.toLocaleString('es-MX')} boletos reservados
          aparte
        </p>
      </article>
      <article
        className={
          'metric-card ' + (data.resultCents < 0 ? 'negative' : 'positive')
        }
      >
        <div className="metric-top">
          <span>Resultado estimado</span>
          <span className="metric-icon">
            <AdminIcon name="chart" />
          </span>
        </div>
        <strong>{money(data.resultCents)}</strong>
        <p>Después de premios, gastos y comisiones</p>
      </article>
    </div>
  )
}
