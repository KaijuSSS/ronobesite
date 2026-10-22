import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BookMarked, Crown, LogOut, PenSquare, Settings, ShieldCheck, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/hooks'
import { signOut } from '@/features/auth/api'
import { getErrorMessage } from '@/lib/errors'
import { displayName } from '@/lib/format'
import { UserAvatar } from './UserAvatar'

export function UserMenu() {
  const { profile, isStaff, isAdmin, user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Меню пользователя"
      >
        <UserAvatar profile={profile} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{displayName(profile)}</div>
          <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profile ? (
          <DropdownMenuItem asChild>
            <Link to={`/profile/${profile.username}`}>
              <User /> Мой профиль
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/library">
            <BookMarked /> Библиотека
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/studio">
            <PenSquare /> Студия автора
          </Link>
        </DropdownMenuItem>
        {isStaff ? (
          <DropdownMenuItem asChild>
            <Link to="/moderation">
              <ShieldCheck /> Модерация
            </Link>
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <Crown /> Администрирование
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings /> Настройки
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()} variant="destructive">
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
