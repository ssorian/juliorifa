import { useState } from 'react'
import { authClient } from '../../lib/auth-client'
import BetterAuthHeader from '../../integrations/better-auth/header-user'
import { useOwnPurchases } from './hooks/useOwnPurchases'
import { PurchaseDetail } from './components/PurchaseDetail'
import { statusLabel } from './lib/presentation'
import { money } from '../../lib/utils/money'
import { errorMessage } from '../raffles/lib/presentation'
import './react.css'

export function PurchasesPage({
  user,
  id,
}: {
  user: { id: string; name: string; role: string }
  id?: string
}) {
  const session = authClient.useSession()
  const ownerMatches = session.data?.user.id === user.id
  const [offset, setOffset] = useState(0)
  const list = useOwnPurchases(user.id, offset, ownerMatches && !id)
  return (
    <div className="nova-public purchases-page">
      <header className="site-header">
        <a className="logo" href="/">
          NOVA RIFAS
        </a>
        <nav>
          <a href="/">Rifas</a>
          <BetterAuthHeader />
        </nav>
      </header>
      <main className="section-wrap">
        <h1>MIS APARTADOS.</h1>
        {!ownerMatches ? (
          <p role="status">Verificando sesión actual…</p>
        ) : id ? (
          <PurchaseDetail key={`${user.id}:${id}`} userId={user.id} id={id} />
        ) : (
          <>
            {list.isPending && <p role="status">Cargando apartados…</p>}
            {list.isError && (
              <p role="alert">
                {errorMessage(list.error)}{' '}
                <button onClick={() => void list.refetch()}>Reintentar</button>
              </p>
            )}
            {list.data && !list.data.length && (
              <p>
                No tienes apartados en esta página.{' '}
                <a href="/">Explorar rifas</a>
              </p>
            )}
            <div className="purchase-list">
              {list.data?.map((p) => (
                <article key={p.id}>
                  <h2>
                    <a href={`/mis-compras?id=${p.id}`}>{p.id}</a>
                  </h2>
                  <p>{statusLabel(p.status)}</p>
                  <p>
                    {p.tickets.length} boletos · {money(p.totalCents)} MXN
                  </p>
                  <p>{p.createdAt}</p>
                  <a
                    className="button secondary"
                    href={`/mis-compras?id=${p.id}`}
                  >
                    Ver apartado
                  </a>
                </article>
              ))}
            </div>
            <div className="input-row">
              <button
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Anterior
              </button>
              <button
                disabled={!list.data || list.data.length < 20}
                onClick={() => setOffset(offset + 20)}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
