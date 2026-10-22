import { NavLink } from 'react-router'
import { BookMarked, Compass, Home, PenSquare, ShieldCheck, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean }

/** Нижняя панель навигации на телефонах. */
export function MobileNav() {
  const { isAuthenticated, isStaff, profile } = useAuth()
  if (!isAuthenticated) return null

  const items: Item[] = [
    { to: '/', label: 'Главная', icon: Home, end: true },
    { to: '/catalog', label: 'Каталог', icon: Compass },
    { to: '/library', label: 'Библиотека', icon: BookMarked },
    isStaff
      ? { to: '/moderation', label: 'Проверка', icon: ShieldCheck }
      : { to: '/studio', label: 'Студия', icon: PenSquare },
    { to: profile ? `/profile/${profile.username}` : '/settings', label: 'Профиль', icon: User },
  ]

  return (
    <nav
      aria-label="Мобильная навигация"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-background/90 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
