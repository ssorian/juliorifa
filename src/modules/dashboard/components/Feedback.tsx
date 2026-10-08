import { adminError } from '../lib/admin'

export function Feedback({
  pending,
  error,
  empty,
}: {
  pending?: boolean
  error?: unknown
  empty?: boolean
}) {
  if (pending) return <p role="status">Cargando datos del servidor…</p>
  if (error) return <p role="alert">{adminError(error)}</p>
  if (empty) return <p>No hay registros para estos filtros.</p>
  return null
}
export function ActionFeedback({
  busy,
  error,
  notice,
}: {
  busy: boolean
  error: string
  notice: string
}) {
  return (
    <>
      <p role="status">{busy ? 'Guardando en servidor…' : notice}</p>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
export function Pager({
  page,
  setPage,
  hasNext,
}: {
  page: number
  setPage: (p: number) => void
  hasNext: boolean
}) {
  return (
    <div className="panel-footer">
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page + 1}</span>
        <button disabled={!hasNext} onClick={() => setPage(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  )
}
