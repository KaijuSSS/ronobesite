import { Link } from 'react-router'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageContainer } from '@/components/layout/AppLayout'
import { useNotificationActions, useNotifications } from '@/features/notifications/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  useDocumentTitle('Уведомления')
  const notifications = useNotifications()
  const { markAll, markOne, remove } = useNotificationActions()
  const hasUnread = notifications.data?.some((n) => !n.read_at)

  return (
    <PageContainer className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Уведомления</h1>
        {hasUnread ? (
          <Button variant="secondary" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck /> Прочитать все
          </Button>
        ) : null}
      </div>

      {notifications.error ? (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      ) : notifications.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : notifications.data.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Уведомлений нет"
          description="Здесь появятся решения модераторов, комментарии к вашим книгам и новые главы авторов, на которых вы подписаны."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.data.map((n) => {
            const unread = !n.read_at
            const link = n.link && n.link.startsWith('/') ? n.link : null
            return (
              <li
                key={n.id}
                className={cn(
                  'flex gap-3 rounded-xl border p-4 transition-colors',
                  unread ? 'border-primary/30 bg-primary/[0.07]' : 'border-white/5 bg-card',
                )}
              >
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {link ? (
                      <Link to={link} onClick={() => unread && markOne.mutate(n.id)} className="hover:text-primary">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                    {unread ? <span className="sr-only"> (не прочитано)</span> : null}
                  </p>
                  {n.body ? <p className="mt-1 text-sm break-words text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1.5 text-xs text-muted-foreground">{formatRelative(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {unread ? (
                    <Button variant="ghost" size="icon-sm" aria-label="Отметить прочитанным" onClick={() => markOne.mutate(n.id)}>
                      <CheckCheck />
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить уведомление" onClick={() => remove.mutate(n.id)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </PageContainer>
  )
}
