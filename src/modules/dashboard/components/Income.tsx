import { adminFinancialMetrics } from '../services/backend'
import { useAdminQuery } from '../hooks/useAdmin'
import { money } from '../../../lib/utils/money'
import { Feedback } from './Feedback'
import { MetricCards } from './MetricCards'
import { AdminIcon } from './AdminIcon'

export function Income() {
  const query = useAdminQuery('finance', '', () =>
    adminFinancialMetrics({ data: {} }),
  )
  const data = query.data
  return (
    <>
      <Feedback pending={query.isPending} error={query.error} />
      {data && (
        <>
          <MetricCards data={data} />
          <div className="finance-layout">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>De ingresos a resultado</h2>
                  <p>Desglose acumulado de todas las rifas</p>
                </div>
                <span className="status-pill scheduled">MXN</span>
              </div>
              <div className="finance-waterfall">
                <div className="finance-line">
                  <span>
                    Ingresos cobrados
                    <br />
                    <small>Solo compras marcadas como pagadas</small>
                  </span>
                  <strong>{money(data.paidCents)}</strong>
                </div>
                <div className="finance-line">
                  <span>Comisiones registradas</span>
                  <strong>− {money(data.feeExpenseCents)}</strong>
                </div>
                <div className="finance-line">
                  <span>Costo de los premios</span>
                  <strong>− {money(data.prizeCostCents)}</strong>
                </div>
                <div className="finance-line">
                  <span>Otros gastos capturados</span>
                  <strong>− {money(data.expensesCents)}</strong>
                </div>
                <div
                  className={
                    'finance-line total ' +
                    (data.resultCents < 0 ? 'negative' : '')
                  }
                >
                  <span>Resultado estimado</span>
                  <strong>{money(data.resultCents)}</strong>
                </div>
                <p className="finance-note">
                  Se descuenta el costo completo de cada premio y los gastos
                  capturados, aunque la rifa aún no termine. Esta estimación no
                  equivale a ingresos disponibles en banco.
                </p>
              </div>
            </section>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Por confirmar</h2>
                  <p>Estos importes aún no son ingresos</p>
                </div>
              </div>
              <div className="income-stat-list">
                <div>
                  <AdminIcon name="clock" />
                  <div>
                    <strong>{money(data.pendingCents)}</strong>
                    <small>Pagos pendientes</small>
                  </div>
                </div>
                <div>
                  <AdminIcon name="cart" />
                  <div>
                    <strong>{data.pendingOrders}</strong>
                    <small>Compras sin confirmar</small>
                  </div>
                </div>
                <div>
                  <AdminIcon name="ticket" />
                  <div>
                    <strong>
                      {data.pendingTickets.toLocaleString('es-MX')}
                    </strong>
                    <small>Boletos reservados</small>
                  </div>
                </div>
              </div>
              <div className="panel-footer">
                <a href="#compras" className="text-button">
                  Revisar compras
                </a>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Resultado por rifa</h2>
                <p>
                  El precio de una venta histórica conserva su valor original
                </p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>RIFA</th>
                    <th>BOLETOS PAGADOS</th>
                    <th>COBRADO</th>
                    <th>COMISIONES</th>
                    <th>PREMIO + GASTOS</th>
                    <th>RESULTADO ESTIMADO</th>
                  </tr>
                </thead>
                <tbody>
                  {data.raffles.map((raffle) => (
                    <tr key={raffle.id}>
                      <td className="table-product">{raffle.title}</td>
                      <td>{raffle.paidTickets.toLocaleString('es-MX')}</td>
                      <td className="money-cell">{money(raffle.paidCents)}</td>
                      <td>{money(raffle.feeExpenseCents)}</td>
                      <td>
                        {money(raffle.prizeCostCents + raffle.expensesCents)}
                      </td>
                      <td
                        className={
                          'money-cell ' +
                          (raffle.resultCents < 0
                            ? 'negative-text'
                            : 'positive-text')
                        }
                      >
                        {money(raffle.resultCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}
