import { BellPlus, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/hooks'
import { formatCount } from '@/lib/format'
import { FOLLOWER_FORMS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useFollowInfo, useToggleFollow } from './hooks'

/** Число подписчиков автора, например «12 подписчиков». */
export function FollowersCount({ authorId, className }: { authorId: string; className?: string }) {
  const info = useFollowInfo(authorId)
  if (!info.data) return null
  return <span className={className}>{formatCount(info.data.followers, FOLLOWER_FORMS)}</span>
}

/**
 * Подписка на автора: подписчики получают уведомления о новых
 * произведениях и главах. Для своего профиля и гостей не показывается.
 */
export function FollowButton({
  authorId,
  size = 'default',
  className,
}: {
  authorId: string
  size?: 'default' | 'sm' | 'lg'
  className?: string
}) {
  const { isAuthenticated, userId } = useAuth()
  const info = useFollowInfo(isAuthenticated && userId !== authorId ? authorId : undefined)
  const toggle = useToggleFollow(authorId)

  if (!isAuthenticated || userId === authorId || !info.data) return null
  const following = info.data.following

  return (
    <Button
      size={size}
      variant={following ? 'secondary' : 'default'}
      className={cn(!following && 'bg-brand-gradient border-0 text-white', className)}
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      aria-pressed={following}
    >
      {following ? <BellRing /> : <BellPlus />}
      {following ? 'Вы подписаны' : 'Подписаться'}
    </Button>
  )
}
