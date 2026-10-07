import { useEffect, useRef, useState } from 'react'
import {
  checkoutKey,
  makeCheckout,
  readCheckout,
  nextIntent,
  recoverCheckout,
} from '../lib/checkout'
import { currentUser } from '../../auth/services/session'
import { lookupOwnReservationByKey } from '../../purchases/server'
import { authClient } from '../../../lib/auth-client'
import { revalidatePicks } from '../lib/presentation'
import { validateIntent } from './useInventoryPage'
import type { PublicRaffleDTO } from '../types/public'

export function useCheckoutIntent(raffle: PublicRaffleDTO) {
  const session = authClient.useSession()
  const [selected, setSelected] = useState<number[]>([])
  const [restoring, setRestoring] = useState(true)
  const [message, setMessage] = useState('')
  const intent = useRef<{ id: string; payload: string } | null>(null)
  const pointer = `nova.cart.${raffle.id}`
  useEffect(() => {
    let live = true
    setRestoring(true)
    setSelected([])
    intent.current = null
    if (session.isPending) return
    async function restore() {
      try {
        const id =
          new URLSearchParams(location.search).get('checkout') ||
          localStorage.getItem(pointer)
        const key = checkoutKey(id)
        const cart = key ? readCheckout(localStorage.getItem(key)) : null
        if (cart?.raffleId === raffle.id) {
          const result = await recoverCheckout(
            localStorage.getItem(key!),
            id!,
            {
              lookup: async (idempotencyKey) => {
                const actor = await currentUser()
                return actor
                  ? lookupOwnReservationByKey({ data: { idempotencyKey } })
                  : null
              },
              available: async (saved) => {
                const { available, open } = await validateIntent(
                  raffle.id,
                  saved.picks,
                  raffle.startNumber,
                  raffle.ticketCount,
                )
                return revalidatePicks(
                  saved.picks,
                  raffle.startNumber,
                  raffle.ticketCount,
                  available,
                  open,
                )
              },
            },
          )
          if (!live) return
          if (result.kind === 'owned') {
            window.location.assign(`/mis-compras?id=${result.purchase.id}`)
            return
          }
          if (result.kind !== 'cart') {
            setRestoring(false)
            return
          }
          const picks = result.picks
          {
            setSelected(picks)
            if (picks.length === cart.picks.length && id)
              intent.current = {
                id,
                payload: JSON.stringify([...picks].sort((a, b) => a - b)),
              }
            setMessage(
              picks.length
                ? 'Selección recuperada y revalidada. Confirma explícitamente para apartar.'
                : 'La selección venció o ya no está disponible.',
            )
          }
        }
      } catch {
        if (live) {
          setRestoring(true)
          setMessage(
            'No pudimos recuperar la selección. Actualiza para intentar nuevamente.',
          )
        }
        return
      }
      if (live) setRestoring(false)
    }
    void restore()
    return () => {
      live = false
    }
  }, [
    raffle.id,
    raffle.startNumber,
    raffle.ticketCount,
    pointer,
    session.isPending,
    session.data?.user.id,
  ])
  async function persist() {
    if (restoring) throw new Error('RESERVATION_UNKNOWN')
    const original = localStorage.getItem(pointer)
    const key = checkoutKey(original)
    if (key && original && readCheckout(localStorage.getItem(key))) {
      const actor = await currentUser()
      const owned = actor
        ? await lookupOwnReservationByKey({
            data: { idempotencyKey: original },
          })
        : null
      if (owned) {
        window.location.assign(`/mis-compras?id=${owned.id}`)
        throw new Error('APARTADO_RECUPERADO')
      }
    }
    intent.current = nextIntent(intent.current, selected, () =>
      crypto.randomUUID().replaceAll('-', ''),
    )
    const id = intent.current.id
    localStorage.setItem(
      checkoutKey(id)!,
      JSON.stringify(makeCheckout(raffle.id, selected, Date.now(), id)),
    )
    localStorage.setItem(pointer, id)
    return id
  }
  function clear() {
    const id = intent.current?.id
    if (id) localStorage.removeItem(checkoutKey(id)!)
    localStorage.removeItem(pointer)
    intent.current = null
    setSelected([])
  }
  return {
    selected,
    setSelected,
    restoring,
    message,
    setMessage,
    persist,
    clear,
  }
}
