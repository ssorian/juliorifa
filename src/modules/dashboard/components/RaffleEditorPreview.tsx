import { editorSummary, statusLabel } from '../lib/raffle-editor'

export function RaffleEditorPreview({
  fields,
  image,
}: {
  fields: {
    title: string
    description: string
    status: string
    price: string
    count: string
    start: string
    cost: string
    expenses: string
  }
  image?: { url: string; alt: string }
}) {
  const summary = editorSummary(
    fields.price,
    fields.count,
    fields.start,
    fields.cost,
    fields.expenses,
  )
  const money = (value: number) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 2,
    }).format(value)
  return (
    <aside className="editor-preview" aria-label="Vista previa del producto">
      <p className="small-eyebrow">VISTA PREVIA DEL PRODUCTO</p>
      <div className="preview-card">
        {image ? (
          <img src={image.url} alt={image.alt} />
        ) : (
          <div className="preview-placeholder">Sin imagen seleccionada</div>
        )}
        <div>
          <span className={`status-pill ${fields.status}`}>
            {statusLabel(fields.status)}
          </span>
          <h3>{fields.title || 'Tu próximo premio'}</h3>
          <p>{fields.description || 'La descripción aparecerá aquí.'}</p>
          <div className="preview-price">
            <span>Precio por boleto</span>
            <strong>
              {money(Number(fields.price) || 0)} <small>MXN</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="preview-facts">
        <div>
          Boletos configurados
          <strong>{summary.count.toLocaleString('es-MX')}</strong>
        </div>
        <div>
          Ingreso máximo bruto<strong>{money(summary.gross)}</strong>
        </div>
        <div>
          Costos capturados<strong>{money(summary.costs)}</strong>
        </div>
      </div>
      <p className="field-help">
        El ingreso máximo supone vender todos los boletos habilitados. No
        representa utilidad.
      </p>
    </aside>
  )
}
