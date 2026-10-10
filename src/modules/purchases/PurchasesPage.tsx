import { useState } from 'react'
import { authClient } from '../../lib/auth-client'
import BetterAuthHeader from '../../integrations/better-auth/header-user'
import { useOwnPurchases } from './hooks/useOwnPurchases'
import { PurchaseDetail } from './components/PurchaseDetail'
import { PurchaseList } from './components/PurchaseCard'
import './react.css'

export function PurchasesPage({
  user,
  id,
}: {
  user: { id: string; name: string; role: string }
  id?: string
}) {
  const session = authClient.useSession()
  const ownerMatches = !session.error && session.data?.user.id === user.id
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
          <p role={session.error ? 'alert' : 'status'}>
            {session.error ? 'No se pudo verificar la sesión. Vuelve a iniciar sesión.' : 'Verificando sesión actual…'}
          </p>
        ) : id ? (
          <PurchaseDetail key={`${user.id}:${id}`} userId={user.id} id={id} />
        ) : (
          <>
            <p className="purchase-list-intro">Tus productos, boletos y estado de pago. Abre un apartado para consultar sus detalles.</p>
            <PurchaseList query={list} />
            <nav className="purchase-pagination" aria-label="Páginas de apartados">
              <button
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Anterior
              </button>
              <button
                disabled={list.isError || list.isPending || !list.data || list.data.length < 20}
                onClick={() => setOffset(offset + 20)}
              >
                Siguiente
              </button>
              <span>Página {offset / 20 + 1}</span>
            </nav>
          </>
        )}
      </main>
    </div>
  )
}
