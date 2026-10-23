import { Suspense, useEffect } from 'react'
import { Outlet, ScrollRestoration, useNavigate } from 'react-router'
import { PageLoader } from '@/components/common/PageLoader'
import { BannedScreen } from '@/features/auth/BannedScreen'
import { useAuth } from '@/features/auth/hooks'
import { useAuthStore } from '@/features/auth/store'
import { Footer } from './Footer'
import { Header } from './Header'
import { MobileNav } from './MobileNav'

/** Переход на смену пароля после ссылки «восстановить пароль». */
export function PasswordRecoveryRedirect() {
  const passwordRecovery = useAuthStore((s) => s.passwordRecovery)
  const navigate = useNavigate()
  useEffect(() => {
    if (passwordRecovery) navigate('/reset-password', { replace: true })
  }, [navigate, passwordRecovery])
  return null
}

export function AppLayout() {
  const { ban } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Перейти к содержимому
      </a>
      <Header />
      <main id="main" className="flex-1">
        {ban ? (
          <BannedScreen ban={ban} />
        ) : (
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        )}
      </main>
      <Footer />
      <MobileNav />
      <PasswordRecoveryRedirect />
      <ScrollRestoration />
    </div>
  )
}

/** Обёртка содержимого страницы с отступами и максимальной шириной. */
export function PageContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 ${className}`}>{children}</div>
}
