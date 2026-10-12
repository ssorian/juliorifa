import type { ReactNode } from 'react'
import type { PurchaseDTO } from '../../purchases/types'
import { money } from '../../../lib/utils/money'
import { purchaseDate } from '../lib/purchase-presentation'
import { StatusPill, initials } from './PurchaseRows'

export function PurchaseFacts({ order, children }: { order: PurchaseDTO; children?: ReactNode }) {
  return (
    <>
      <section className="purchase-summary" aria-label="Resumen de compra">
        <div className="purchase-intro">
          <span className="avatar">{initials(order.customer?.name ?? 'Cliente')}</span>
          <div><strong>{order.customer?.name ?? 'Cliente no disponible'}</strong><small>{order.customer?.email}</small></div>
          <StatusPill status={order.status} />
        </div>
        <dl className="purchase-amounts">
          <div><dt>Total de esta compra</dt><dd>{money(order.totalCents)}</dd></div>
          <div><dt>Boletos × precio guardado</dt><dd>{order.tickets.length} × {money(order.priceCents)}</dd></div>
          <div><dt>Creada · CDMX</dt><dd>{purchaseDate(order.createdAt)}</dd></div>
        </dl>
        {order.customer?.phone && order.customer.whatsapp ? (
          <p className="purchase-contact">
            <span>{order.customer.phone}</span>
            <a className="button ghost" href={order.customer.whatsapp} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">WhatsApp manual</a>
          </p>
        ) : <p className="section-note">Contacto no disponible (cuenta antigua).</p>}
      </section>
      {children}
      <details className="purchase-section">
        <summary>{`Ver ${order.tickets.length} boletos`}</summary>
        <ul className="purchase-tickets" aria-label="Boletos de esta compra" tabIndex={0}>
          {order.tickets.map((ticket) => <li key={ticket}>{ticket}</li>)}
        </ul>
      </details>
      <details className="purchase-section">
        <summary>Instrucciones bancarias de esta compra</summary>
        <p className="section-note">Valores guardados al apartar; no cambian con la cuenta actual.</p>
        {order.paymentInstructions ? (
          <dl className="purchase-bank">
            {([['bank', 'Banco'], ['beneficiary', 'Beneficiario'], ['account', 'Cuenta / referencia'], ['instructions', 'Instrucciones']] as const).map(([key, label]) => (
              <div key={key}><dt>{label}</dt><dd>{order.paymentInstructions![key]}</dd></div>
            ))}
          </dl>
        ) : <p>Histórico sin snapshot bancario. No se reemplaza con la cuenta actual.</p>}
      </details>
      <details className="purchase-section">
        <summary>Datos técnicos y fechas</summary>
        <dl className="purchase-bank">
          <div><dt>Folio completo</dt><dd>{order.id}</dd></div>
          <div><dt>ID de rifa</dt><dd>{order.raffleId}</dd></div>
          <div><dt>Comisión histórica · gasto admin</dt><dd>{money(order.feeCents)} ({order.feeBps} bps), sin recargo comprador</dd></div>
          <div><dt>Plazo para recibir comprobante · CDMX</dt><dd>{purchaseDate(order.expiresAt)}{order.status === 'reviewing' && <small>En revisión no vence automáticamente.</small>}</dd></div>
          <div><dt>Comprobante recibido · CDMX</dt><dd>{order.proofReceivedAt ? purchaseDate(order.proofReceivedAt) : 'No recibido'}</dd></div>
          <div><dt>Revisión · CDMX</dt><dd>{order.reviewedAt ? purchaseDate(order.reviewedAt) : 'Sin revisión'}</dd></div>
        </dl>
      </details>
    </>
  )
}
