import { PurchaseProgress } from './PurchaseProgress'
import { money } from '../../../lib/utils/money'
import { formatDate } from '../../../lib/utils/date'
import { statusLabel } from '../lib/presentation'
import type { PurchaseDTO } from '../types'

export function PurchaseSummary({ purchase }: { purchase: PurchaseDTO }) {
  const p = purchase
  return (
    <>
      <header className="purchase-heading">
        <div><span className="purchase-eyebrow">Tu participación</span>
          <h2>{p.raffleTitle || 'Tu apartado'}</h2>
        </div>
        <span className={`purchase-status purchase-status--${p.status}`} role="status">{statusLabel(p.status)}</span>
      </header>
      <p className="purchase-reference">Referencia completa: <code>{p.id}</code></p>
      <div className="purchase-overview">
        <div><span>Importe de transferencia</span><strong>{money(p.totalCents)} MXN</strong></div>
        <div><span>Boletos apartados</span><strong>{p.tickets.length}</strong></div>
        <div><span>Creado:</span><p>{formatDate(p.createdAt)}</p></div>
      </div>
      <PurchaseProgress purchase={p} />
      <section className="purchase-tickets" aria-label="Boletos de tu apartado">
        <h3>Tus boletos</h3>
        <div className="purchase-ticket-grid">
          {p.tickets.slice(0, 12).map(ticket => <span className="purchase-ticket-chip" key={ticket}>{ticket}</span>)}
        </div>
        {p.tickets.length > 12 && <details>
          <summary>Ver todos los {p.tickets.length} boletos</summary>
          <div className="purchase-ticket-grid purchase-ticket-scroll" tabIndex={0} aria-label="Todos tus boletos">
            {p.tickets.map(ticket => <span className="purchase-ticket-chip" key={ticket}>{ticket}</span>)}
          </div>
        </details>}
      </section>
      {p.reviewedAt && <p>Revisado: {formatDate(p.reviewedAt)}</p>}
      {p.proofReceivedAt && (
        <p>Comprobante recibido: {formatDate(p.proofReceivedAt)}</p>
      )}
      {p.status === 'awaiting_proof' && (
        <p>Fecha límite para subir comprobante: {formatDate(p.expiresAt)}</p>
      )}
      {p.status === 'reviewing' && (
        <p>
          Comprobante recibido a tiempo. Tus boletos siguen retenidos hasta que
          administración apruebe o rechace, sin vencimiento automático.
        </p>
      )}
      {p.paymentInstructions ? (
        <div className="payment-snapshot">
          <h3>Instrucciones guardadas en tu apartado</h3>
          <dl>
            <dt>Banco</dt>
            <dd>{p.paymentInstructions.bank}</dd>
            <dt>Beneficiario</dt>
            <dd>{p.paymentInstructions.beneficiary}</dd>
            <dt>Cuenta</dt>
            <dd>{p.paymentInstructions.account}</dd>
            <dt>Instrucciones</dt>
            <dd>{p.paymentInstructions.instructions}</dd>
            <dt>Referencia de apartado</dt>
            <dd>{p.id}</dd>
          </dl>
          <p>
            Usa el concepto indicado en las instrucciones. Conserva el ID del
            apartado como referencia.
          </p>
        </div>
      ) : (
        <p>
          No hay instrucciones bancarias guardadas para este apartado. No
          inventamos datos bancarios.
        </p>
      )}
    </>
  )
}
