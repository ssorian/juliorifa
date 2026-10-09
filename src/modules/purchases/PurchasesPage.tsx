import { useState } from 'react'
import { authClient } from '../../lib/auth-client'
import BetterAuthHeader from '../../integrations/better-auth/header-user'
import { useOwnPurchases } from './hooks/useOwnPurchases'
import { PurchaseDetail } from './components/PurchaseDetail'
import { PurchaseCard } from './components/PurchaseCard'
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
                <PurchaseCard key={p.id} purchase={p} />
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
