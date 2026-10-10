import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { currentUser } from '../../auth/services/session'
import { PurchaseDetail } from '../../purchases/components/PurchaseDetail'
import '../../purchases/react.css'
import { reservationDialog } from '../lib/reservation-dialog'
import { salesState } from '../lib/sales-state'
import { TicketSalesNotice } from './TicketSalesNotice'
import { createReservation } from '../../purchases/server'
import { availableInventory, suggestedTickets } from '../services/server'
import { useSuggestedTickets, useRaffleAvailability, useRaffleAvailabilityRefresh } from '../hooks/useRaffleAvailability'
import { useInventoryPage } from '../hooks/useInventoryPage'
import { useCheckoutIntent } from '../hooks/useCheckoutIntent'
import { money } from '../../../lib/utils/money'
import { errorMessage, parseTicket, ticketLabel } from '../lib/presentation'
import type { PublicRaffleDTO } from '../types/public'

export function TicketSelection({ raffle }: { raffle: PublicRaffleDTO }) {
  const cart = useCheckoutIntent(raffle)
  const { selected, setSelected } = cart
  const [from, setFrom] = useState(raffle.startNumber)
  const inventory = useInventoryPage(raffle.id, from)
  const availability = useRaffleAvailability(raffle.id)
  const suggestions = useSuggestedTickets(raffle.id, selected)
  const refreshAvailability = useRaffleAvailabilityRefresh(raffle.id)
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<number | null>(null)
  const [quantity, setQuantity] = useState(10)
  const [busy, setBusy] = useState(false)
  const [accessId, setAccessId] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [actorId, setActorId] = useState<string | null>(null)
  const [reservedId, setReservedId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const paymentDialog = reservationDialog(reservedId, actorId)
  const notice = salesState(availability, inventory, suggestions)
  const open = notice === null && inventory.isSuccess && inventory.data.salesOpen === true &&
    suggestions.isSuccess && suggestions.data.salesOpen === true &&
    availability.isSuccess && availability.data.salesOpen === true && !cart.restoring
  const pad = (n: number) =>
    ticketLabel(n, raffle.startNumber, raffle.ticketCount)
  function toggle(n: number) {
    if (selected.includes(n)) setSelected(selected.filter((x) => x !== n))
    else if (open && selected.length < 1000) setSelected([...selected, n])
    else cart.setMessage('Máximo 1,000 boletos. La venta debe estar abierta.')
  }
  async function find(event: React.FormEvent) {
    event.preventDefault()
    if (!open || busy) return
    setResult(null)
    const n = parseTicket(search, raffle.startNumber, raffle.ticketCount)
    if (n === null) {
      cart.setMessage('Escribe un número entero dentro del rango.')
      return
    }
    setBusy(true)
    try {
      const page = await refreshAvailability(() => availableInventory({
        data: { id: raffle.id, from: n, limit: 1 },
      }))
      if (page.salesOpen && page.tickets[0]?.state === 'available') {
        setResult(n)
        cart.setMessage(
          'Número disponible. La disponibilidad se verifica al apartar.',
        )
      } else cart.setMessage('Número no disponible o venta cerrada.')
    } catch (e) {
      cart.setMessage(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  async function random(event: React.FormEvent) {
    event.preventDefault()
    if (!open || busy) return
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity + selected.length > 1000
    ) {
      cart.setMessage('Elige una cantidad entera; máximo 1,000 en total.')
      return
    }
    setBusy(true)
    try {
      const page = await refreshAvailability(() => suggestedTickets({
        data: { id: raffle.id, exclude: selected, limit: quantity },
      }))
      if (!page.salesOpen) {
        cart.setMessage('La venta está cerrada.')
        return
      }
      const pool = page.suggestions
      if (pool.length < quantity) {
        cart.setMessage(
          `Hay ${page.eligible} disponibles sin seleccionar en toda la rifa. Elige una cantidad menor.`,
        )
        return
      }
      setSelected([...selected, ...pool.slice(0, quantity)])
      cart.setMessage('Sugerencias agregadas; se verificarán al apartar.')
    } catch (e) {
      cart.setMessage(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  async function review() {
    if (busy || !selected.length || !open) return
    setBusy(true)
    try {
      const id = await cart.persist()
      const user = await currentUser()
      setReservedId(null)
      setActorId(user?.id ?? null)
      setAccessId(user ? null : id)
      dialog.current?.showModal()
    } catch {
      cart.setMessage(
        'No pudimos verificar la sesión o guardar la intención. Intenta nuevamente.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function confirm() {
    if (busy || !open) return
    setBusy(true)
    try {
      const id = await cart.persist()
      const purchase = await createReservation({
        data: { raffleId: raffle.id, tickets: selected, idempotencyKey: id },
      })
      cart.clear()
      setReservedId(purchase.id)
      void queryClient.invalidateQueries({
        queryKey: ['public-inventory', raffle.id],
      })
      void queryClient.invalidateQueries({
        queryKey: ['own-purchases', actorId],
      })
    } catch (e) {
      cart.setMessage(errorMessage(e))
      dialog.current?.close()
      await queryClient.invalidateQueries({
        queryKey: ['public-inventory', raffle.id],
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div id="comprar" className="ticket-panel">
        {notice ? <TicketSalesNotice state={notice} /> : <>
        <div className="panel-heading">
          <p className="eyebrow">// ENTRA EN EL JUEGO</p>
          <h2>
            ELIGE TUS <em>BOLETOS.</em>
          </h2>
          <p>{money(raffle.priceCents)} MXN por boleto · {pad(raffle.startNumber)}–{pad(raffle.startNumber + raffle.ticketCount - 1)}</p>
        </div>
        {cart.restoring && <p role="status">Revalidando selección…</p>}
        {inventory.isPending && <p role="status">Consultando inventario…</p>}
        {inventory.isError && (
          <p role="alert">
            {errorMessage(inventory.error)}{' '}
            <button onClick={() => void refreshAvailability(() => inventory.refetch())}>Reintentar</button>
          </p>
        )}
        <div className="lucky-heading">
          <h3>NÚMEROS SUGERIDOS</h3>
          <button className="text-button" disabled={!open || busy || suggestions.isFetching}
            onClick={() => void refreshAvailability(() => suggestions.refresh())}>↻ Otros números</button>
        </div>
        <p className="help-text">Disponibles en toda la rifa; ninguna sugerencia mejora tus probabilidades.</p>
        {suggestions.isPending && <p role="status">Consultando sugerencias…</p>}
        {suggestions.isError && <p role="alert">{errorMessage(suggestions.error)} <button onClick={() => void refreshAvailability(() => suggestions.refresh())}>Reintentar sugerencias</button></p>}
        <div className="lucky-grid" aria-label="Números sugeridos">
          {!suggestions.isError && suggestions.data?.suggestions.map(n => (
            <button type="button" key={n} className={`ticket-number ${selected.includes(n) ? 'selected' : ''}`} disabled={!open || busy}
              aria-pressed={selected.includes(n)} onClick={() => toggle(n)}>{pad(n)}</button>
          ))}
        </div>
        {suggestions.isSuccess && !suggestions.data.suggestions.length && <p role="status">No hay sugerencias disponibles sin seleccionar.</p>}
        <details className="inventory-details">
        <summary>Ver inventario paginado</summary>
        <h3>INVENTARIO · {pad(from)}</h3>
        <p className="help-text">
          Solo los números disponibles se pueden elegir. No quedan reservados
          hasta confirmar.
        </p>
        <div className="lucky-grid">
          {inventory.data?.tickets.map((t) => (
            <button
              key={t.number}
              className={`ticket-number ${selected.includes(t.number) ? 'selected' : ''}`}
              disabled={!open || busy || t.state !== 'available'}
              aria-pressed={selected.includes(t.number)}
              onClick={() => toggle(t.number)}
            >
              {pad(t.number)}
              {t.state !== 'available' && <small> No disponible</small>}
            </button>
          ))}
        </div>
        {inventory.data &&
          !inventory.data.tickets.some((t) => t.state === 'available') && (
            <p>No hay números disponibles en esta página.</p>
          )}
        <div className="input-row">
          <button
            disabled={from === raffle.startNumber || busy}
            onClick={() => setFrom(Math.max(raffle.startNumber, from - 100))}
          >
            Anterior
          </button>
          <button
            disabled={
              from + 100 >= raffle.startNumber + raffle.ticketCount || busy
            }
            onClick={() => setFrom(from + 100)}
          >
            Siguiente
          </button>
          <button onClick={() => void refreshAvailability(() => inventory.refetch())}>
            Actualizar inventario
          </button>
        </div>
        </details>
        <div className="ticket-divider">O ELIGE A TU MANERA</div>
        <form className="search-form" onSubmit={find}>
          <label htmlFor="number">Busca tu número especial</label>
          <div className="input-row">
            <input
              id="number"
              inputMode="numeric"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setResult(null)
              }}
              placeholder={pad(raffle.startNumber)}
            />
            <button className="button secondary" disabled={!open || busy}>
              BUSCAR
            </button>
          </div>
        </form>
        {result !== null && (
          <div className="search-result">
            <strong>{pad(result)}</strong>
            <button disabled={busy || !open} onClick={() => toggle(result)}>
              {selected.includes(result) ? 'Quitar' : 'Agregar'}
            </button>
          </div>
        )}
        <form className="quantity-form" onSubmit={random}>
          <label htmlFor="quantity">
            ¿Prefieres elegir una cantidad?
          </label>
          <div className="input-row">
            <input
              id="quantity"
              type="number"
              min="1"
              max="1000"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
            <button className="button secondary" disabled={!open || busy}>
              AGREGAR
            </button>
          </div>
          <p className="help-text">Agrega números disponibles de toda la rifa.</p>
          <div className="quantity-presets">
            {[10, 50, 100].map((n) => (
              <button type="button" key={n} disabled={!open || busy} onClick={() => setQuantity(n)}>
                {n} boletos
              </button>
            ))}
          </div>
        </form>
        <p role="status" className="search-feedback">
          {cart.message}
        </p>
        <div className="selection-heading">
          <h3>
            TUS BOLETOS <span>{selected.length}</span>
          </h3>
          <button onClick={() => setSelected([])} disabled={busy || cart.restoring}>
            Limpiar
          </button>
        </div>
        <div className="selected-react">
          {selected.length ? (
            selected.map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => toggle(n)}
                aria-label={`Quitar ${pad(n)}`}
              >
                {pad(n)} ×
              </button>
            ))
          ) : (
            <p>Todavía no eliges números.</p>
          )}
        </div>
        <p className="help-text">
          El importe definitivo y las instrucciones bancarias se guardan en el
          apartado. Sin recargo ni cobro automático.
        </p>
        <div className="selection-summary">
        <div>
          <span>ESTIMADO · {selected.length} BOLETOS</span>
          <strong>{money(selected.length * raffle.priceCents)} MXN</strong>
        </div>
        <button
          className="button primary"
          disabled={!selected.length || !open || busy}
          onClick={() => void review()}
        >
          CONTINUAR
        </button>
        </div>
        </>}
      </div>
      <dialog
        ref={dialog}
        className="react-dialog purchase-checkout"
        aria-labelledby="checkout-title"
      >
        <button className="button secondary checkout-close" onClick={() => dialog.current?.close()} disabled={busy}>
          Cerrar ×
        </button>
        {paymentDialog ? (
          <>
            <h2 id="checkout-title">Apartado confirmado</h2>
            <p>
              Transfiere el importe indicado y sube tu comprobante. El pago
              requiere confirmación manual.
            </p>
            <PurchaseDetail
              userId={paymentDialog.userId}
              id={paymentDialog.id}
            />
            <a className="button secondary" href={`/mis-compras?id=${reservedId}`}>
              Continuar en Mis apartados
            </a>
          </>
        ) : notice ? (
          <h2 id="checkout-title">{notice === 'closed' ? 'Esta rifa ha finalizado' : 'Boletos agotados'}</h2>
        ) : accessId ? (
          <>
            <h2 id="checkout-title">Ingresa para continuar</h2>
            <p>
              Tu selección se conserva por 30 minutos en este navegador, incluso
              en otra pestaña. Al volver se verificará; aún no hay apartado.
            </p>
            <a className="button primary" href={`/login?checkout=${accessId}`}>
              Iniciar sesión
            </a>
            <a
              className="button secondary"
              href={`/signin?checkout=${accessId}`}
            >
              Registrarme como cliente
            </a>
          </>
        ) : (
          <>
            <h2 id="checkout-title">Confirma tu apartado</h2>
            <div className="checkout-estimate">
              <h3>{raffle.title}</h3>
              <p>{selected.length} boletos · importe estimado</p>
              <strong>{money(selected.length * raffle.priceCents)} MXN</strong>
            </div>
            <p>
              Tendrás 24 horas para subir el comprobante de transferencia. Si
              llega a tiempo, tus boletos permanecen retenidos hasta la revisión
              manual. Solo el pago aprobado participa en el sorteo.
            </p>
            <button
              className="button primary"
              disabled={busy || !selected.length || !open}
              onClick={() => void confirm()}
            >
              {busy ? 'Apartando…' : 'CONFIRMAR APARTADO'}
            </button>
          </>
        )}
      </dialog>
    </>
  )
}
