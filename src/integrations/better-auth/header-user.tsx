import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'
import { currentUser } from '../../modules/auth/services/session'

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession()
  const identity = session?.user.id || null
  const client = useQueryClient()
  const router = useRouter()
  const previous = useRef(identity)
  const previousRole = useRef<string | null>(null)
  const user = useQuery({
    queryKey: ['current-user', identity],
    queryFn: () => currentUser(),
    enabled: !isPending,
    retry: false,
    staleTime: 0,
    refetchInterval: 15000,
  })
  useEffect(() => {
    const role = user.isError ? null : (user.data?.role ?? null)
    if (
      previous.current !== identity ||
      (previousRole.current !== null && previousRole.current !== role)
    ) {
      void client.cancelQueries({ queryKey: ['private-admin'] })
      client.removeQueries({ queryKey: ['private-admin'] })
      void client.cancelQueries({ queryKey: ['own-purchases'] })
      client.removeQueries({ queryKey: ['own-purchases'] })
      client.removeQueries({ queryKey: ['current-user', previous.current] })
      previous.current = identity
      void router.invalidate()
    }
    previousRole.current = role
  }, [identity, user.data?.role, user.isError, client, router])
  if (isPending || user.isPending) return <span>Consultando sesión…</span>
  if (user.isError)
    return (
      <span>
        No pudimos verificar la sesión.{' '}
        <button onClick={() => void user.refetch()}>Reintentar</button>
      </span>
    )
  if (!user.data || !identity || user.data.id !== identity)
    return (
      <>
        <a href="/login">Ingresar</a>
        <a href="/signin">Registrarse</a>
      </>
    )
  return (
    <>
      <span>{user.data.name || 'Cliente'}</span>
      <a href="/mis-compras">Mis apartados</a>
      {user.data.role === 'admin' && <a href="/dashboard/">Admin</a>}
      <button
        onClick={async () => {
          await client.cancelQueries({ queryKey: ['current-user'] })
          client.setQueriesData({ queryKey: ['current-user'] }, null)
          await client.cancelQueries({ queryKey: ['private-admin'] })
          client.removeQueries({ queryKey: ['private-admin'] })
          await client.cancelQueries({ queryKey: ['own-purchases'] })
          client.removeQueries({ queryKey: ['own-purchases'] })
          const result = await authClient.signOut()
          if (result.error) {
            void user.refetch()
            return
          }
          client.removeQueries({ queryKey: ['current-user'] })
          await router.invalidate()
          window.location.assign('/')
        }}
      >
        Salir
      </button>
    </>
  )
}
