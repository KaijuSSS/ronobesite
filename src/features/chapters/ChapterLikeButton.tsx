import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/hooks'
import { formatCount } from '@/lib/format'
import { LIKE_FORMS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useChapterLikes, useToggleChapterLike } from './hooks'

/** «Нравится» под главой. Гость видит только число. */
export function ChapterLikeButton({ chapterId }: { chapterId: string }) {
  const { isAuthenticated } = useAuth()
  const likes = useChapterLikes(chapterId)
  const toggle = useToggleChapterLike(chapterId)

  if (!likes.data) return null
  const { count, liked } = likes.data

  return (
    <div className="flex flex-col items-center gap-2 font-sans">
      <Button
        variant="secondary"
        size="lg"
        className={cn('rounded-full px-6', liked && 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25')}
        onClick={() => toggle.mutate()}
        disabled={!isAuthenticated || toggle.isPending}
        aria-pressed={liked}
        aria-label={liked ? 'Убрать отметку «Нравится»' : 'Нравится'}
      >
        <Heart className={cn(liked && 'fill-current')} />
        {liked ? 'Вам нравится' : 'Нравится'}
      </Button>
      <span className="text-xs text-[color:var(--muted-foreground)]">{formatCount(count, LIKE_FORMS)}</span>
    </div>
  )
}
