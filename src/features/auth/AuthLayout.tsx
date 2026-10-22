import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router'
import { Logo } from '@/components/layout/Logo'
import { PasswordRecoveryRedirect } from '@/components/layout/AppLayout'

export function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-15%] left-[-10%] h-[420px] w-[520px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute right-[-10%] bottom-[-15%] h-[380px] w-[480px] rounded-full bg-blue-600/15 blur-[120px]" />
      </div>
      <Link to="/" className="relative mb-8 rounded-lg" aria-label="На главную">
        <Logo />
      </Link>
      <main className="relative w-full max-w-md">
        <Outlet />
      </main>
      <PasswordRecoveryRedirect />
    </div>
  )
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-card/90 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
      <div className="mb-6 space-y-1.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  )
}
