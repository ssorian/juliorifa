import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { authClient } from '../../lib/auth-client'
import { currentUser } from '../auth/services/session'
import BetterAuthHeader from '../../integrations/better-auth/header-user'
import { AdminIdentity, useAdminQuery } from './hooks/useAdmin'
import { adminPaymentInstructions } from '../purchases/server'
import { canRenderAdmin } from './lib/admin'
import { Overview } from './components/Overview'
import { RafflesTable } from './components/RafflesTable'
import { OrdersTable } from './components/Purchases'
import { Income } from './components/Income'
import { Settings } from './components/Settings'
import { Notifications } from './components/Notifications'
import { Feedback } from './components/Feedback'
import './design.css'
import './react.css'

const tabs = [
  'Resumen',
  'Rifas',
  'Compras',
  'Ingresos',
  'Configuración',
  'Notificaciones',
] as const
export function Dashboard() {
  const { data: session, isPending } = authClient.useSession()
  const identity = session?.user.id ?? null
  const client = useQueryClient(),
    router = useRouter()
  const user = useQuery({
    queryKey: ['current-user', identity],
    queryFn: () => currentUser(),
    enabled: !isPending,
    retry: false,
    staleTime: 0,
    refetchInterval: 15000,
  })
  const allowed =
    !isPending && canRenderAdmin(user.data, identity) && !user.isError
  useEffect(() => {
    if (!allowed) {
      void client.cancelQueries({ queryKey: ['private-admin'] })
      client.removeQueries({ queryKey: ['private-admin'] })
      if (!isPending && !user.isPending) void router.invalidate()
    }
  }, [allowed, isPending, user.isPending, client, router])
  if (!allowed)
    return (
      <div className="nova-admin">
        <main>
          <Feedback pending={isPending || user.isPending} error={user.error} />
          <p>
            El contenido administrativo requiere una sesión actual de
            administrador verificada en servidor.
          </p>
          <a href="/">Volver al sitio</a>
        </main>
      </div>
    )
  return (
    <AdminIdentity.Provider value={identity!}>
      <Workspace key={identity} />
    </AdminIdentity.Provider>
  )
}
function Workspace() {
  const settings = useAdminQuery('settings', '', () =>
    adminPaymentInstructions(),
  )
  const [tab, setTab] = useState<string>('Resumen')
  useEffect(() => {
    function route() {
      const hash = decodeURI(window.location.hash.slice(1))
      setTab(tabs.find((t) => t.toLowerCase() === hash) ?? 'Resumen')
    }
    route()
    window.addEventListener('hashchange', route)
    return () => window.removeEventListener('hashchange', route)
  }, [])
  return (
    <div className="nova-admin">
      <a className="skip-link" href="#admin-main">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">N</span>
          <span>
            NOVA<small>ADMIN WORKSPACE</small>
          </span>
        </a>
        <p className="workspace-label">OPERACIÓN</p>
        <nav>
          {tabs.map((t, i) => (
            <a
              key={t}
              href={'#' + t.toLowerCase()}
              className={tab === t ? 'active' : ''}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              <span>{['◈', '▤', '⌑', '↗', '⚙', '✉'][i]}</span>
              {t}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <p className="small-eyebrow">// MAKE YOUR LUCK</p>
          <p>Tu operación, en el siguiente nivel.</p>
          <span className="sidebar-decoration">NOVA</span>
        </div>
        <a className="store-link" href="/">
          ↗ Ver sitio público
        </a>
      </aside>
      <div className="admin-workspace">
        <header className="topbar">
          <p className="breadcrumb">
            Workspace <span>/</span>
            <strong>{tab}</strong>
          </p>
          <div className="topbar-right">
            <BetterAuthHeader />
          </div>
        </header>
        <main id="admin-main">
          <div className="page-heading">
            <div>
              <p className="small-eyebrow">// NOVA ADMIN</p>
              <h1>{tab}</h1>
              <p>Tus rifas, compras e ingresos en un mismo lugar.</p>
            </div>
          </div>
          <Feedback error={settings.error} />
          {settings.data === null && (
            <p role="alert">
              Falta configuración bancaria. Completa Configuración antes de
              aceptar reservas públicas.
            </p>
          )}
          {tab === 'Resumen' && <Overview />}
          {tab === 'Rifas' && <RafflesTable />}
          {tab === 'Compras' && <OrdersTable />}
          {tab === 'Ingresos' && <Income />}
          {tab === 'Configuración' && <Settings />}
          {tab === 'Notificaciones' && <Notifications />}
        </main>
        <footer className="admin-footer">
          <span>NOVA · NEXT LEVEL OPERATIONS</span>
          <span>Servidor como única autoridad</span>
        </footer>
      </div>
    </div>
  )
}
