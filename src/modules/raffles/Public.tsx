import { useEffect, useState } from 'react'
import { Catalog, PublicRules } from './components/Catalog'
import { ProductDetail } from './components/ProductDetail'
import BetterAuthHeader from '../../integrations/better-auth/header-user'
import { authClient } from '../../lib/auth-client'
import { currentUser } from '../auth/services/session'
import { lookupOwnReservationByKey } from '../purchases/server'
import { checkoutKey, readCheckout, recoverCheckout } from './lib/checkout'
import { usePublicRaffle, usePublicRaffles } from './hooks/usePublicRaffles'
import { errorMessage } from './lib/presentation'
import './design.css'
import './react.css'

export function Public() {
  const session = authClient.useSession()
  const [recovering, setRecovering] = useState(true)
  const [recoveryError, setRecoveryError] = useState(false)
  const [id, setId] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const list = usePublicRaffles(offset)
  const detail = usePublicRaffle(id)
  useEffect(() => {
    function navigate() {
      const match = /^#rifa\/([0-9a-f-]{36})$/i.exec(location.hash)
      setId(match?.[1] || null)
      if (match) window.scrollTo(0, 0)
    }
    navigate()
    const key = checkoutKey(
      new URLSearchParams(location.search).get('checkout'),
    )
    if (key) {
      try {
        const cart = readCheckout(localStorage.getItem(key))
        if (cart && /^[0-9a-f-]{36}$/i.test(cart.raffleId)) {
          location.hash = `rifa/${cart.raffleId}`
          setId(cart.raffleId)
        }
      } catch {
        /* Storage is optional for browsing. */
      }
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  // Run independently of public raffle visibility/profile gates (archived sales included).
  useEffect(() => {
    let live = true
    setRecovering(true)
    setRecoveryError(false)
    if (session.isPending) return
    async function recover() {
      try {
        const source = new URLSearchParams(location.search).get('checkout')
        const token =
          source || (id ? localStorage.getItem(`nova.cart.${id}`) : null)
        const key = checkoutKey(token)
        if (key && token) {
          const result = await recoverCheckout(
            localStorage.getItem(key),
            token,
            {
              lookup: async (idempotencyKey) => {
                const actor = await currentUser()
                return actor
                  ? lookupOwnReservationByKey({ data: { idempotencyKey } })
                  : null
              },
              available: async (cart) => cart.picks,
            },
          )
          if (live && result.kind === 'owned') {
            window.location.assign(`/mis-compras?id=${result.purchase.id}`)
            return
          }
        }
        if (live) setRecovering(false)
      } catch {
        if (live) setRecoveryError(true)
      }
    }
    void recover()
    return () => {
      live = false
    }
  }, [id, session.isPending, session.data?.user.id])
  const query = id ? detail : list
  return (
    <div className="nova-public">
      <a className="skip-link" href="#content">
        Ir al contenido
      </a>
      <div className="side-signal" aria-hidden="true">
        ✦<span>MAKE YOUR LUCK</span>
        <i />
        <small>/// 001</small>
      </div>
      <span className="side-word" aria-hidden="true">
        NEXT LEVEL LUCK
      </span>
      <header className="site-header">
        <a className="logo" href="/#productos">
          <span className="logo-mark">N</span>
          <span>
            NOVA<small>RIFAS</small>
          </span>
        </a>
        <nav>
          <a href="#productos">Rifas</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#faq">FAQ</a>
          <BetterAuthHeader />
        </nav>
      </header>
      <main id="content" className="section-wrap">
        {recovering && (
          <p role="status">
            {recoveryError
              ? 'No pudimos consultar tu apartado. Recarga para reintentar; tu selección sigue guardada.'
              : 'Consultando selección guardada…'}
          </p>
        )}
        {!recovering && query.isPending && <p role="status">Cargando rifas…</p>}
        {query.isError && (
          <p role="alert">
            {errorMessage(query.error)}{' '}
            <button onClick={() => void query.refetch()}>Reintentar</button>
            {id && <a href="#productos">Volver al catálogo</a>}
          </p>
        )}
        {!recovering &&
          (id
            ? detail.data && (
                <>
                  <ProductDetail key={detail.data.id} raffle={detail.data} />
                  <PublicRules />
                </>
              )
            : list.data && (
                <>
                  <Catalog raffles={list.data} />
                  <div className="input-row">
                    <button
                      disabled={!offset}
                      onClick={() => setOffset(Math.max(0, offset - 24))}
                    >
                      Anterior
                    </button>
                    <button
                      disabled={list.data.length < 24}
                      onClick={() => setOffset(offset + 24)}
                    >
                      Más rifas
                    </button>
                  </div>
                </>
              ))}
      </main>
      <footer className="site-footer section-wrap">
        <a className="logo" href="#productos">
          <span className="logo-mark">N</span>
          <span>
            NOVA<small>RIFAS</small>
          </span>
        </a>
        <span>HECHO PARA TU PRÓXIMO NIVEL.</span>
        <small>© 2026 Nova · Transferencia y revisión manual</small>
      </footer>
    </div>
  )
}
