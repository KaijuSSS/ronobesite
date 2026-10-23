import { Link } from 'react-router'
import { useAuth } from '@/features/auth/hooks'
import { Logo } from './Logo'

export function Footer() {
  const { isAuthenticated, canWrite } = useAuth()
  return (
    <footer className="mt-16 border-t border-white/5 pb-24 lg:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Закрытая площадка для чтения и публикации ранобэ, веб-новелл и рассказов. Все тексты проходят модерацию.
          </p>
        </div>
        {isAuthenticated ? (
          <nav aria-label="Ссылки в подвале" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <Link className="text-muted-foreground hover:text-foreground" to="/catalog">
              Каталог
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/library">
              Библиотека
            </Link>
            {canWrite ? (
              <Link className="text-muted-foreground hover:text-foreground" to="/studio">
                Студия автора
              </Link>
            ) : (
              <Link className="text-muted-foreground hover:text-foreground" to="/notifications">
                Уведомления
              </Link>
            )}
            <Link className="text-muted-foreground hover:text-foreground" to="/settings">
              Настройки
            </Link>
          </nav>
        ) : null}
      </div>
      <div className="border-t border-white/5">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} RanobeSite. Тексты принадлежат их авторам.
        </p>
      </div>
    </footer>
  )
}
