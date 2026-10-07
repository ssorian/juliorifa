import { createFileRoute, redirect } from '@tanstack/react-router'
import { currentUser } from '../modules/auth/services/session'
import { PurchasesPage } from '../modules/purchases/PurchasesPage'
import { purchaseSearch } from '../modules/purchases/lib/route-search'

export const Route = createFileRoute('/mis-compras')({
  validateSearch: purchaseSearch,
  beforeLoad: async () => {
    const user = await currentUser()
    if (!user) throw redirect({ href: '/login' })
    return { user }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = Route.useRouteContext()
  const { id } = Route.useSearch()
  return <PurchasesPage user={user} id={id} />
}
