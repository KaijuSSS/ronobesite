import { Link } from 'react-router'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUnreadNotifications } from '@/features/notifications/hooks'

export function NotificationBell() {
  const { data: unread = 0 } = useUnreadNotifications()
  const label = unread > 0 ? `Уведомления: ${unread} непрочитанных` : 'Уведомления'

  return (
    <Button asChild variant="ghost" size="icon" className="relative rounded-full">
      <Link to="/notifications" aria-label={label} title={label}>
        <Bell />
        {unread > 0 ? (
          <span className="bg-brand-gradient absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  )
}
