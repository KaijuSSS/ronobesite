import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { PageLoader } from '@/components/common/PageLoader'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router'
import type { AppRole } from '@/types/database'
import { useAuth, useCatalogAccess } from './hooks'

function useLoginRedirect() {
  const location = useLocation()
  const redirect = `${location.pathname}${location.search}`
  return `/login?redirect=${encodeURIComponent(redirect)}`
}

/** Доступ к каталогу и чтению: участник сайта или открытый каталог. */
export function RequireMember({ children }: { children: ReactNode }) {
  const access = useCatalogAccess()
  const loginUrl = useLoginRedirect()
  if (access.isLoading) return <PageLoader />
  if (!access.canRead) return <Navigate to={loginUrl} replace />
  return <>{children}</>
}

/** Только для вошедших пользователей. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const loginUrl = useLoginRedirect()
  if (auth.isLoading) return <PageLoader />
  if (!auth.isAuthenticated) return <Navigate to={loginUrl} replace />
  return <>{children}</>
}

/** Только для указанных ролей. Права всё равно проверяются базой данных. */
export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const auth = useAuth()
  const loginUrl = useLoginRedirect()
  if (auth.isLoading) return <PageLoader />
  if (!auth.isAuthenticated) return <Navigate to={loginUrl} replace />
  if (!roles.some((r) => auth.roles.includes(r))) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Недостаточно прав"
        description="Этот раздел доступен только модераторам и администраторам."
        action={
          <Button asChild variant="secondary">
            <Link to="/">На главную</Link>
          </Button>
        }
      />
    )
  }
  return <>{children}</>
}

/** Для страниц входа: вошедшего пользователя отправляет дальше. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.isLoading) return <PageLoader />
  if (auth.isAuthenticated) {
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect')
    const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
    return <Navigate to={safe} replace />
  }
  return <>{children}</>
}
