import { useEffect, useState } from 'react'
import { formatDate } from '../../../lib/utils/date'
import type { PublicDrawDTO } from '../types/public'

export function DrawStatus({
  drawAt,
  result,
  isSuccess,
  isError,
  now: suppliedNow,
  onRefresh,
}: {
  drawAt: string
  result: PublicDrawDTO | undefined
  isSuccess: boolean
  isError: boolean
  now?: number | null
  onRefresh?: () => void
}) {
  const [clock, setClock] = useState<number | null>(null)
  useEffect(() => {
    setClock(Date.now())
    const timer = setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const now = suppliedNow === undefined ? clock : suppliedNow
  const scheduled = Date.parse(drawAt)
  const knownTime =
    now !== null && Number.isFinite(now) && Number.isFinite(scheduled)
  let label = 'Sin resultado publicado'
  if (isError) label = 'Resultado no disponible'
  else if (!isSuccess) label = 'Consultando resultado…'
  else if (result === null && knownTime) {
    label = scheduled > now ? 'Sorteo programado' : 'Sorteo pendiente'
  }
  return (
    <section className="draw-status" aria-label="Estado del sorteo">
      <p>Fecha programada: {formatDate(drawAt)}</p>
      {isError && <p role="alert">No pudimos consultar el resultado.</p>}
      {result ? (
        <div role="status">
          <h2>Resultado del sorteo</h2>
          <p>Boleto ganador: {result.winnerTicket}</p>
          <p>Realizado el: {formatDate(result.drawnAt)}</p>
        </div>
      ) : (
        <>
          <p role="status">{label}</p>
          <p>
            La revisión automática, cuando está habilitada, es diaria y no
            garantiza ejecución exacta a la fecha programada.
          </p>
        </>
      )}
      {onRefresh && (
        <button type="button" onClick={onRefresh}>
          Actualizar resultado
        </button>
      )}
    </section>
  )
}
