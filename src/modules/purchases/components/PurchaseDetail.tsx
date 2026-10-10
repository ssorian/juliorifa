import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOwnPurchase, useOwnAudit } from '../hooks/useOwnPurchases'
import { auditLabel, ownKey, purchaseFlags } from '../lib/presentation'
import { cancelReservation } from '../server'
import { PurchaseSummary } from './PurchaseSummary'
import { ProofUpload } from './ProofUpload'
import { usePublicDraw } from '../../raffles/hooks/usePublicRaffles'
import { errorMessage } from '../../raffles/lib/presentation'
import type { PurchaseDTO } from '../types'
import { copyText } from '../lib/clipboard'
import { formatDate } from '../../../lib/utils/date'

export function PurchaseDetail({ userId, id }: { userId: string; id: string }) {
  const query = useOwnPurchase(userId, id, true)
  const audit = useOwnAudit(userId, id, !!query.data)
  const [now, setNow] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const client = useQueryClient()
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  async function refresh() {
    await client.invalidateQueries({ queryKey: ownKey(userId, 'detail', id) })
    await client.invalidateQueries({ queryKey: ownKey(userId, 'audit', id) })
    await client.invalidateQueries({
      queryKey: ['own-purchases', userId, 'list'],
    })
  }
  const deadlinePassed =
    now !== null && now >= Date.parse(query.data?.expiresAt || '')
  const refetch = query.refetch
  const status = query.data?.status
  useEffect(() => {
    if (status === 'awaiting_proof' && deadlinePassed) void refetch()
  }, [status, deadlinePassed, refetch])
  async function upload(file: File) {
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(
        file.type,
      ) ||
      file.size > 10 * 1024 * 1024 ||
      !file.size
    ) {
      setMessage('Selecciona PNG, JPEG, WebP o PDF, máximo 10 MB.')
      return false
    }
    setBusy(true)
    setMessage('Enviando comprobante…')
    let received = false
    try {
      const response = await fetch(`/api/uploads/proofs/${id}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!response.ok) {
        if (response.status === 429)
          setMessage(
            'Demasiados intentos. Espera un minuto y vuelve a intentar.',
          )
        else {
          const body = await response.json().catch(() => null)
          setMessage(
            errorMessage(new Error(body?.error || 'BACKEND_UNAVAILABLE')),
          )
        }
      } else {
        received = true
        setMessage(
          'Comprobante recibido. Consulta el estado actualizado; el pago requiere revisión manual.',
        )
      }
    } catch {
      setMessage(
        'No pudimos confirmar el envío. Actualiza antes de reintentar.',
      )
    } finally {
      try {
        await refresh()
      } catch {
        setMessage(
          'No pudimos actualizar el estado. Consulta el apartado antes de reintentar.',
        )
      } finally {
        setBusy(false)
      }
    }
    return received
  }
  async function copy(value: string, label: string) {
    setMessage('Copiando…')
    const copied = await copyText(value)
    setMessage(
      copied
        ? `${label}: copiado.`
        : `No pudimos copiar ${label.toLowerCase()}. Selecciona y copia el valor manualmente.`,
    )
  }
  async function cancel() {
    setBusy(true)
    try {
      const result = await cancelReservation({ data: { id } })
      setMessage(
        result.status === 'expired'
          ? 'El plazo venció y los boletos se liberaron.'
          : 'Apartado cancelado.',
      )
    } catch (e) {
      setMessage(errorMessage(e))
    } finally {
      try {
        await refresh()
      } catch {
        setMessage(
          'No pudimos actualizar el estado. Consulta el apartado antes de reintentar.',
        )
      } finally {
        setBusy(false)
      }
    }
  }
  if (query.isPending) return <p role="status">Cargando apartado…</p>
  if (query.isError)
    return (
      <p role="alert">
        {errorMessage(query.error)}{' '}
        <button onClick={() => void query.refetch()}>Reintentar</button>
      </p>
    )
  const p = query.data
  const flags = purchaseFlags(p.status, p.expiresAt, now)
  const seconds =
    now === null
      ? null
      : Math.max(0, Math.floor((Date.parse(p.expiresAt) - now) / 1000))
  return (
    <section className="purchase-detail">
      <a href="/mis-compras">‹ Mis apartados</a>
      <PurchaseSummary purchase={p} />
      <Winner purchase={p} />
      {p.status === 'awaiting_proof' && (
        <p role="status">
          {seconds === null
            ? 'Consultando plazo…'
            : seconds === 0
              ? 'El plazo venció. Actualizando el estado…'
              : `Tiempo restante: ${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`}
        </p>
      )}
      <div className="purchase-actions">
      <button className="button secondary" onClick={() => void copy(p.id, 'Referencia')}>
        Copiar referencia
      </button>
      {p.paymentInstructions && (
        <button
          className="button secondary"
          onClick={() => void copy(p.paymentInstructions!.account, 'Cuenta')}
        >
          Copiar cuenta
        </button>
      )}
      <button
        className="button secondary"
        onClick={() => void copy((p.totalCents / 100).toFixed(2), 'Importe')}
      >
        Copiar importe
      </button>
      <button
        disabled={busy}
        className="button secondary"
        onClick={() =>
          void refresh().catch(() =>
            setMessage('No pudimos actualizar el estado.'),
          )
        }
      >
        Actualizar
      </button>
      </div>
      {flags.upload && <ProofUpload key={id} busy={busy} onSend={upload} />}
      {flags.cancel && (
        <button
          disabled={busy}
          className="button purchase-danger"
          onClick={() => {
            if (window.confirm('¿Cancelar el apartado y liberar tus boletos?'))
              void cancel()
          }}
        >
          Cancelar apartado
        </button>
      )}
      {p.proofReceivedAt && (
        <a
          className="button secondary"
          href={`/api/media/proofs/${p.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Descargar comprobante privado
        </a>
      )}
      <p role="status">{message}</p>
      <h3>Historial</h3>
      {audit.isPending && <p>Cargando historial…</p>}
      {audit.isError && (
        <p role="alert">
          No pudimos consultar el historial.{' '}
          <button onClick={() => void audit.refetch()}>Reintentar</button>
        </p>
      )}
      <ol className="purchase-timeline">
        {audit.data?.map((event, i) => (
          <li key={i}>
            <strong>{auditLabel(event.type)}</strong>
            <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
            {event.reason && <p>Motivo: {event.reason === 'Proof received' ? 'Comprobante recibido' : event.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}
function Winner({ purchase }: { purchase: PurchaseDTO }) {
  const draw = usePublicDraw(purchase.raffleId)
  if (
    purchase.status !== 'paid' ||
    !draw.data ||
    !purchase.tickets.includes(draw.data.winnerTicket)
  )
    return null
  return (
    <p role="status">
      Este apartado contiene el boleto ganador {draw.data.winnerTicket}. Sorteo:{' '}
      {formatDate(draw.data.drawnAt)}.
    </p>
  )
}
