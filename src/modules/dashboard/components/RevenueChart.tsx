import { money } from '../../../lib/utils/money'

export interface RevenueDay {
  date: string
  paidCents: number
  orders: number
}
function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  })
    .format(new Date(value + 'T12:00:00Z'))
    .replaceAll(' de ', ' ')
}
function fullDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(value + 'T12:00:00Z'))
    .replaceAll(' de ', ' ')
}
export function RevenueChart({ chart }: { chart: RevenueDay[] }) {
  if (chart.length !== 14)
    return <p>Gráfica no disponible: se requieren 14 días del servidor.</p>
  const total = chart.reduce((sum, d) => sum + d.paidCents, 0),
    top =
      Math.ceil(Math.max(100000, ...chart.map((d) => d.paidCents)) / 100000) *
      100000
  const points = chart.map((d, i) => [
    75 + (i * 520) / 13,
    155 - (d.paidCents / top) * 125,
  ])
  const path = points.map((p, i) => (i ? 'L' : 'M') + p.join(',')).join(' ')
  return (
    <div className="chart-area">
      <div className="chart-title-row">
        <div>
          <strong>{money(total)}</strong>
          <div className="chart-legend">
            <i />
            Ingresos cobrados
          </div>
        </div>
        <span>MXN · últimos 14 días</span>
      </div>
      <svg
        className="sales-chart"
        viewBox="0 0 615 200"
        role="img"
        aria-label={`Ingresos cobrados por día: ${money(total)}`}
      >
        <title>Ingresos diarios cobrados</title>
        <desc>
          {chart
            .map((d) => `${fullDate(d.date)}: ${money(d.paidCents)}`)
            .join('; ')}
        </desc>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              className="chart-grid"
              x1="75"
              y1={155 - v * 125}
              x2="598"
              y2={155 - v * 125}
            />
            <text className="chart-axis" x="0" y={159 - v * 125}>
              {money(top * v)}
            </text>
          </g>
        ))}
        <path d={`${path} L595,155 L75,155 Z`} fill="#ff334b22" />
        <path d={path} fill="none" stroke="#ff526b" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle key={chart[i].date} cx={p[0]} cy={p[1]} r="3" fill="#ff6a7d">
            <title>{`${fullDate(chart[i].date)}: ${money(chart[i].paidCents)}`}</title>
          </circle>
        ))}
        {[0, 3, 6, 9, 13].map((i) => (
          <text
            key={i}
            className="chart-axis"
            x={75 + (i * 520) / 13}
            y="183"
            textAnchor={i === 0 ? 'start' : i === 13 ? 'end' : 'middle'}
          >
            {shortDate(chart[i].date)}
          </text>
        ))}
      </svg>
      <div className="chart-bottom">
        <span>
          Solo pagos confirmados · {chart[0].date} — {chart[13].date}
        </span>
        <span>
          {chart.reduce((sum, d) => sum + d.orders, 0)} compras pagadas
        </span>
      </div>
    </div>
  )
}
