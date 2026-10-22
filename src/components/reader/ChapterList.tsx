import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Check } from 'lucide-react'
import type { ChapterListItem } from '@/features/chapters/api'
import { formatChapterNumber, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type ChapterListProps = {
  bookSlug: string
  chapters: ChapterListItem[]
  currentId?: string
  /** Номер последней прочитанной главы — более ранние отмечаются галочкой. */
  readUpTo?: number
  onNavigate?: () => void
  dense?: boolean
  showDates?: boolean
  descending?: boolean
}

export function ChapterList({
  bookSlug,
  chapters,
  currentId,
  readUpTo,
  onNavigate,
  dense,
  showDates,
  descending,
}: ChapterListProps) {
  const currentRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
  }, [currentId])

  const items = descending ? [...chapters].reverse() : chapters

  return (
    <ol className="space-y-1">
      {items.map((chapter) => {
        const current = chapter.id === currentId
        const read = readUpTo !== undefined && chapter.number < readUpTo
        return (
          <li key={chapter.id}>
            <Link
              ref={current ? currentRef : undefined}
              to={`/book/${bookSlug}/chapter/${chapter.id}`}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 transition-colors',
                dense ? 'py-2' : 'py-2.5',
                current ? 'bg-primary/15 text-foreground' : 'hover:bg-white/[0.05]',
              )}
            >
              <span
                className={cn(
                  'w-12 shrink-0 text-sm tabular-nums',
                  current ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {formatChapterNumber(chapter.number)}
              </span>
              <span className={cn('min-w-0 flex-1 truncate text-sm', read && !current && 'text-muted-foreground')}>
                {chapter.published_title || `Глава ${formatChapterNumber(chapter.number)}`}
              </span>
              {read && !current ? <Check className="size-4 shrink-0 text-emerald-400" aria-label="Прочитано" /> : null}
              {showDates ? (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {formatDate(chapter.published_at)}
                </span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
