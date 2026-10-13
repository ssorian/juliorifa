import { createFileRoute, redirect } from '@tanstack/react-router'
import { currentUser } from '../modules/auth/services/session'
import { Security } from '../modules/auth/components/Security'
import '../modules/auth/auth.css'

export const Route = createFileRoute('/seguridad')({
  beforeLoad: async () => {
    const user = await currentUser()
    if (!user) throw redirect({ href: '/login' })
    if (user.role !== 'admin') throw redirect({ href: '/' })
    if (!user.mfaRequired) throw redirect({ href: '/dashboard' })
    return { enrolled: user.mfaEnrolled }
  },
  component: SecurityPage,
})
function SecurityPage() {
  const { enrolled } = Route.useRouteContext()
  return <Security enrolled={enrolled} />
}
