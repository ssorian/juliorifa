import { formatDate } from '../../../lib/utils/date'
import { money } from '../../../lib/utils/money'
import type { PublicRaffleDTO } from '../types/public'

export function Catalog({ raffles }: { raffles: PublicRaffleDTO[] }) {
  return (
    <>
      <section id="productos" className="catalog">
        <div className="section-heading">
          <div>
            <p className="eyebrow">// ELIGE TU PRÓXIMO UPGRADE</p>
            <h1>
              UN BOLETO. UN NUEVO <em>NIVEL.</em>
            </h1>
          </div>
          <span className="section-index">01 / RIFAS DISPONIBLES</span>
        </div>
        <div className="product-grid">
          {raffles.map((r) => (
            <article className="product-card" key={r.id}>
              <a
                className="product-image-link"
                href={`#rifa/${r.id}`}
                aria-label={`Ver ${r.title}`}
              >
                {r.images[0] ? (
                  <img
                    src={r.images[0].mediaUrl}
                    alt={r.images[0].alt || r.title}
                  />
                ) : (
                  <p>Imagen no disponible</p>
                )}
                <span className="product-badge">
                  {r.completed ? 'Terminada' : r.salesOpen ? 'RIFA ACTIVA' : 'VENTA CERRADA'}
                </span>
              </a>
              <div className="product-card-body">
                <p className="product-category">// NEXT LEVEL</p>
                <h2>{r.title}</h2>
                <p className="product-spec">{r.description}</p>
                <div className="raffle-meta">
                  <div className="raffle-price">
                    <strong>{money(r.priceCents)}</strong>
                    <small>MXN / boleto</small>
                  </div>
                  <span className="raffle-date">
                    Sorteo
                    <br />
                    {formatDate(r.drawAt)}
                  </span>
                </div>
                <p className="catalog-inventory-note">
                  {r.ticketCount} boletos · Consulta disponibilidad actual en la
                  rifa.
                </p>
                <a className="button primary" href={`#rifa/${r.id}`}>
                  {r.salesOpen ? 'COMPRAR BOLETOS' : 'Ver rifa'} <span aria-hidden="true">✦</span>
                </a>
              </div>
            </article>
          ))}
        </div>
        {!raffles.length && <p>No hay rifas públicas disponibles.</p>}
        <p className="catalog-note">
          <span aria-hidden="true">✦</span> Elige el celular que va contigo. Cada
          boleto es una oportunidad.
        </p>
      </section>
      <section className="cta-section" aria-labelledby="catalog-cta-title">
        <span className="cta-line" aria-hidden="true" />
        <div>
          <p className="eyebrow">// TU SUERTE ENTRA EN JUEGO</p>
          <h2 id="catalog-cta-title">
            EL SIGUIENTE
            <br />
            PUEDES SER
            <br />
            <em>TÚ.</em>
          </h2>
          <p>
            Tu próximo celular empieza con un número.
            <br />
            Encuentra el tuyo y participa.
          </p>
          <a className="button primary" href="#productos">
            QUIERO MIS BOLETOS <span aria-hidden="true">✦</span>
          </a>
        </div>
        <div className="cta-art" aria-hidden="true">
          <span className="big-number">
            00<span>7</span>
          </span>
          <span className="ticket-line">TU NÚMERO. TU OPORTUNIDAD.</span>
        </div>
      </section>
      <PublicRules />
    </>
  )
}
export function PublicRules() {
  return (
    <>
      <section id="como-funciona" className="how-section">
        <div className="section-heading">
          <h2>
            PON A PRUEBA <em>TU SUERTE.</em>
          </h2>
          <span className="section-index">02 / CÓMO FUNCIONA</span>
        </div>
        <div className="steps">
          {[
            [
              'ELIGE TU PREMIO',
              'Consulta la rifa y el inventario sin iniciar sesión.',
            ],
            [
              'APARTA TUS NÚMEROS',
              'Ingresa y confirma el apartado. El importe y los datos de transferencia quedan guardados.',
            ],
            [
              'ENVÍA TU COMPROBANTE',
              'Tienes 24 horas. Un envío a tiempo retiene los boletos hasta la revisión manual. Solo pagos aprobados participan.',
            ],
          ].map(([title, text], i) => (
            <article key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="faq" className="faq-section">
        <div className="faq-heading">
          <p className="eyebrow">// SIN DUDAS</p>
          <h2>
            ANTES DE <em>PARTICIPAR.</em>
          </h2>
        </div>
        <div className="faq-list">
          {[
            [
              '¿Elegir un boleto lo reserva?',
              'No. La selección es una intención. Solo confirmar un apartado autenticado reserva los números disponibles, de manera atómica. Máximo 1,000 por apartado.',
            ],
            [
              '¿Cómo pago?',
              'Por transferencia manual usando las instrucciones e importe de tu apartado. No hay pasarela, recargo ni aprobación automática.',
            ],
            [
              '¿Cuándo vence?',
              'Tienes 24 horas para subir el comprobante. Si no llega a tiempo, los boletos se liberan. Si se recibe a tiempo, permanecen retenidos sin vencimiento automático hasta aprobación o rechazo.',
            ],
            [
              '¿Qué pasa si se rechaza?',
              'El apartado conserva su historial y motivo, pero libera los boletos. Puedes cancelar antes del vencimiento solo si aún está pendiente de comprobante.',
            ],
            [
              '¿Cómo se elige al ganador?',
              'El sorteo interno usa únicamente boletos con pago aprobado. El resultado público muestra el número y la fecha, sin identidad del ganador. Las sugerencias aleatorias no dan más posibilidades.',
            ],
            [
              '¿Recibiré una notificación inmediata?',
              'Las notificaciones se encolan para su entrega. Consulta siempre Mis apartados para conocer el estado actual.',
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
