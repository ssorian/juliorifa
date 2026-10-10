import { formatDate } from '../../../lib/utils/date'
import { money } from '../../../lib/utils/money'
import { DrawStatus } from './DrawStatus'
import { TicketSelection } from './TicketSelection'
import { usePublicDraw } from '../hooks/usePublicRaffles'
import { useRaffleAvailability } from '../hooks/useRaffleAvailability'
import { soldPercentage } from '../lib/availability'
import { errorMessage } from '../lib/presentation'
import type { PublicRaffleDTO } from '../types/public'

export function ProductDetail({ raffle }: { raffle: PublicRaffleDTO }) {
  const draw = usePublicDraw(raffle.id)
  const availability = useRaffleAvailability(raffle.id)
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
            <h1>{raffle.title.toLocaleUpperCase('es-MX')}</h1>
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

            </div>
            <p>Cierre de venta: {formatDate(raffle.salesDeadline)}</p>
            <div className="product-availability" aria-label="Disponibilidad de boletos">
              {availability.isPending && <p role="status">Consultando disponibilidad…</p>}
              {availability.isError ? <p role="alert">{errorMessage(availability.error)} <button onClick={() => void availability.refetch()}>Reintentar disponibilidad</button></p> : availability.data && <>
                <div className="availability-labels">
                  <span>{availability.data.available.toLocaleString('es-MX')} boletos disponibles</span>
                  <span>{soldPercentage(availability.data)}% vendidos</span>
                </div>
                <progress max={raffle.ticketCount} value={availability.data.sold} aria-label="Boletos pagados" />
                <p className="help-text">Solo los pagos confirmados cuentan como vendidos. Los apartados y bloqueados no están disponibles.</p>
              </>}
            </div>
            <h3>CONOCE EL PREMIO</h3>
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
