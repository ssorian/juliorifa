import { createFileRoute, redirect } from '@tanstack/react-router'
import { Dashboard } from '../../modules/dashboard/Dashboard'
import { currentUser } from '../../modules/auth/services/session'
import { dashboardAccess } from '../../modules/auth/lib/policy'

export const Route = createFileRoute('/dashboard/')({
  beforeLoad: async () => {
    const user = await currentUser()
    if (!user) throw redirect({ href: '/login' })
    if (!dashboardAccess(user)) throw redirect({ href: '/' })
  },
  component: Dashboard,
})
