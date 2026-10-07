import { money } from '../../../lib/utils/money'
import { statusLabel } from '../lib/presentation'
import type { PurchaseDTO } from '../types'

export function PurchaseSummary({ purchase }: { purchase: PurchaseDTO }) {
  const p = purchase
  return (
    <>
      <h2>Apartado {p.id}</h2>
      <p role="status">{statusLabel(p.status)}</p>
      <p>Creado: {p.createdAt}</p>
      <p>
        Importe de transferencia: <strong>{money(p.totalCents)} MXN</strong>
      </p>
      <p>
        {p.tickets.length} boletos · {p.tickets.join(' · ')}
      </p>
      {p.reviewedAt && <p>Revisado: {p.reviewedAt}</p>}
      {p.proofReceivedAt && <p>Comprobante recibido: {p.proofReceivedAt}</p>}
      {p.status === 'awaiting_proof' && (
        <p>Fecha límite para subir comprobante: {p.expiresAt}</p>
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
