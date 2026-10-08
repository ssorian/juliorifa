import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { authClient } from '../../lib/auth-client'
import { currentUser } from '../auth/services/session'
import BetterAuthHeader from '../../integrations/better-auth/header-user'
import { AdminIdentity } from './hooks/useAdmin'
import { canRenderAdmin } from './lib/admin'
import { Overview } from './components/Overview'
import { RafflesTable } from './components/RafflesTable'
import { OrdersTable } from './components/Purchases'
import { Income } from './components/Income'
import { Feedback } from './components/Feedback'
import { AdminIcon } from './components/AdminIcon'
import { RaffleEditor } from './components/RaffleEditor'
import './design.css'
import './react.css'

const tabs = ['Resumen', 'Rifas', 'Compras', 'Ingresos'] as const
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
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<(typeof tabs)[number]>('Resumen')
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
            NOVA<small>CONTROL CENTER</small>
          </span>
        </a>
        <div className="workspace-label">
          <span>ADMINISTRACIÓN</span>
          <span className="tiny-pill">V.01</span>
        </div>
        <nav>
          {tabs.map((t, i) => (
            <a
              key={t}
              href={'#' + t.toLowerCase()}
              className={tab === t ? 'active' : ''}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => setTab(t)}
            >
              <AdminIcon
                name={(['grid', 'ticket', 'cart', 'chart'] as const)[i]}
              />
              {t}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <p className="small-eyebrow">// TU OPERACIÓN</p>
          <p>
            Cada número cuenta.
            <br />
            Ten el control de cada rifa.
          </p>
          <span className="sidebar-decoration">NOVA</span>
        </div>
        <a className="store-link" href="/">
          <AdminIcon name="external" /> Ver sitio de rifas
        </a>
      </aside>
      <div className="admin-workspace">
        <header className="topbar">
          <p className="breadcrumb">
            Administración <span>/</span>
            <strong>{tab}</strong>
          </p>
          <div className="topbar-right">
            <span id="today-label">
              {new Intl.DateTimeFormat('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'America/Mexico_City',
              }).format(new Date())}
            </span>
            <BetterAuthHeader />
          </div>
        </header>
        <main id="admin-main">
          <div className="page-heading">
            <div>
              <p className="small-eyebrow">// NOVA ADMIN</p>
              <h1>
                {
                  {
                    Resumen: 'Resumen de operación',
                    Rifas: 'Tus rifas',
                    Compras: 'Compras y participantes',
                    Ingresos: 'Ingresos y resultados',
                  }[tab]
                }
              </h1>
              <p>
                {
                  {
                    Resumen: 'Tus rifas, compras e ingresos en un mismo lugar.',
                    Rifas:
                      'Crea premios, configura boletos y controla la disponibilidad.',
                    Compras:
                      'Consulta los compradores, sus números y la confirmación de pago.',
                    Ingresos:
                      'Lo cobrado, lo pendiente y el costo de cada premio.',
                  }[tab]
                }
              </p>
            </div>
            {['Resumen', 'Rifas'].includes(tab) && (
              <button
                className="button primary"
                onClick={() => setCreating(true)}
              >
                <AdminIcon name="plus" />
                Crear rifa
              </button>
            )}
          </div>
          {tab === 'Resumen' && <Overview />}
          {tab === 'Rifas' && <RafflesTable />}
          {tab === 'Compras' && <OrdersTable />}
          {tab === 'Ingresos' && <Income />}
          {creating && (
            <RaffleEditor raffle={null} onClose={() => setCreating(false)} />
          )}
        </main>
        <footer className="admin-footer">
          <span>NOVA ADMIN /// CONTROL CENTER</span>
          <span>Servidor como única autoridad</span>
        </footer>
      </div>
    </div>
  )
}
