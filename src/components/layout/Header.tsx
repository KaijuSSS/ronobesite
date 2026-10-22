import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth, useCatalogAccess } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { SearchBox } from './SearchBox'
import { UserMenu } from './UserMenu'

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-white/[0.06] text-foreground' : 'text-muted-foreground hover:text-foreground',
  )
}

export function Header() {
  const { isAuthenticated, isStaff, isLoading } = useAuth()
  const { canRead } = useCatalogAccess()
  const [mobileSearch, setMobileSearch] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="shrink-0 rounded-lg" aria-label="RanobeSite — на главную">
          <Logo />
        </Link>

        <nav aria-label="Основная навигация" className="ml-4 hidden items-center gap-1 lg:flex">
          <NavLink to="/" end className={navClass}>
            Главная
          </NavLink>
          {canRead ? (
            <NavLink to="/catalog" className={navClass}>
              Каталог
            </NavLink>
          ) : null}
          {isAuthenticated ? (
            <>
              <NavLink to="/library" className={navClass}>
                Библиотека
              </NavLink>
              <NavLink to="/studio" className={navClass}>
                Студия
              </NavLink>
            </>
          ) : null}
          {isStaff ? (
            <NavLink to="/moderation" className={navClass}>
              Модерация
            </NavLink>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isAuthenticated ? <SearchBox className="hidden w-72 md:block" /> : null}
          {isAuthenticated ? (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full md:hidden"
              onClick={() => setMobileSearch((v) => !v)}
              aria-label={mobileSearch ? 'Закрыть поиск' : 'Открыть поиск'}
              aria-expanded={mobileSearch}
            >
              {mobileSearch ? <X /> : <Search />}
            </Button>
          ) : null}

          {isLoading ? (
            <div className="size-9 animate-pulse rounded-full bg-muted" aria-hidden />
          ) : isAuthenticated ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Войти</Link>
              </Button>
              <Button asChild size="sm" className="bg-brand-gradient hidden border-0 sm:inline-flex">
                <Link to="/register">Регистрация</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {mobileSearch ? (
        <div className="border-t border-white/5 px-4 py-3 md:hidden">
          <SearchBox autoFocus onSubmitted={() => setMobileSearch(false)} />
        </div>
      ) : null}
    </header>
  )
}
