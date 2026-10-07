import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOwnPurchase, useOwnAudit } from '../hooks/useOwnPurchases'
import { ownKey, purchaseFlags } from '../lib/presentation'
import { cancelReservation } from '../server'
import { PurchaseSummary } from './PurchaseSummary'
import { usePublicDraw } from '../../raffles/hooks/usePublicRaffles'
import { errorMessage } from '../../raffles/lib/presentation'
import type { PurchaseDTO } from '../types'

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
      return
    }
    setBusy(true)
    setMessage('Enviando comprobante…')
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
        setMessage(
          'Comprobante recibido. Consulta el estado actualizado; el pago requiere revisión manual.',
        )
      }
    } catch {
      setMessage(
        'No pudimos confirmar el envío. Actualiza antes de reintentar.',
      )
    } finally {
      await refresh()
      setBusy(false)
    }
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
      await refresh()
      setBusy(false)
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
      <button
        onClick={() =>
          void navigator.clipboard
            .writeText(p.id)
            .then(() => setMessage('Referencia copiada.'))
            .catch(() => setMessage('No pudimos copiar la referencia.'))
        }
      >
        Copiar referencia
      </button>
      {p.paymentInstructions && (
        <button
          onClick={() =>
            void navigator.clipboard
              .writeText(p.paymentInstructions!.account)
              .then(() => setMessage('Cuenta copiada.'))
              .catch(() => setMessage('No pudimos copiar la cuenta.'))
          }
        >
          Copiar cuenta
        </button>
      )}
      <button disabled={busy} onClick={() => void refresh()}>
        Actualizar
      </button>
      {flags.upload && (
        <label className="proof-upload">
          Subir comprobante (PNG, JPEG, WebP o PDF; máximo 10 MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void upload(file)
            }}
          />
        </label>
      )}
      {flags.cancel && (
        <button
          disabled={busy}
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
      <ul>
        {audit.data?.map((event, i) => (
          <li key={i}>
            {event.createdAt} · {event.type}
            {event.reason && <> · Motivo: {event.reason}</>}
          </li>
        ))}
      </ul>
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
      {draw.data.drawnAt}.
    </p>
  )
}
