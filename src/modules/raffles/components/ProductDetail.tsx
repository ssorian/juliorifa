import { formatDate } from '../../../lib/utils/date'
import { money } from '../../../lib/utils/money'
import { DrawStatus } from './DrawStatus'
import { TicketSelection } from './TicketSelection'
import { usePublicDraw } from '../hooks/usePublicRaffles'
import type { PublicRaffleDTO } from '../types/public'

export function ProductDetail({ raffle }: { raffle: PublicRaffleDTO }) {
  const draw = usePublicDraw(raffle.id)
  return (
    <section className="product-main">
      <a className="back-link" href="#productos">
        ‹ VOLVER A LAS RIFAS
      </a>
      <div className="product-layout">
        <div className="product-detail">
          <div className="detail-image">
            {raffle.images[0] ? (
              <img
                src={raffle.images[0].mediaUrl}
                alt={raffle.images[0].alt || raffle.title}
              />
            ) : (
              <p>Imagen no disponible</p>
            )}
            <span className="product-badge">
              {raffle.status === 'active' ? 'RIFA ACTIVA' : 'VENTA CERRADA'}
            </span>
          </div>
          <div className="detail-info">
            <p className="eyebrow">// TU PRÓXIMO UPGRADE</p>
            <h1>{raffle.title}</h1>
            <p>{raffle.description}</p>
            <div className="detail-stats">
              <div>
                <span>Precio por boleto</span>
                <strong className="price">{money(raffle.priceCents)}</strong>
              </div>
              <div>
                <span>Fecha programada</span>
                <strong>{formatDate(raffle.drawAt)}</strong>
              </div>
              <div>
                <span>Boletos</span>
                <strong>{raffle.ticketCount}</strong>
              </div>
            </div>
            <p>Cierre de venta: {formatDate(raffle.salesDeadline)}</p>
            <dl className="spec-grid">
              {raffle.features.map((f, i) => (
                <div key={i}>
                  <dt>{f.title}</dt>
                  <dd>{f.description}</dd>
                </div>
              ))}
            </dl>
            <DrawStatus
              drawAt={raffle.drawAt}
              result={draw.data}
              isSuccess={draw.isSuccess}
              isError={draw.isError}
              onRefresh={() => void draw.refetch()}
            />
            <p className="detail-bottom-note">
              Apartado de 24 horas para enviar comprobante. Revisión manual;
              solo pagos aprobados participan.{' '}
              <a href="#faq">Preguntas frecuentes</a>.
            </p>
          </div>
        </div>
        <TicketSelection key={raffle.id} raffle={raffle} />
      </div>
    </section>
  )
}
