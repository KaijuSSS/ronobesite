import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import type { BookSummary } from '@/features/books/api'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/format'
import { CHAPTER_FORMS } from '@/lib/labels'
import { BookCover } from './BookCover'
import { RatingBadge } from './BookBadges'

type BookCardProps = {
  book: BookSummary
  className?: string
}

export function BookCard({ book, className }: BookCardProps) {
  const genres = book.genres.slice(0, 2).map((g) => g.name).join(' · ')
  return (
    <article className={cn('group relative min-w-0', className)}>
      <Link
        to={`/book/${book.slug}`}
        className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <div className="relative transition-transform duration-300 group-hover:-translate-y-1">
          <BookCover title={book.title} url={book.coverUrl} adult={book.is_adult} blurAdult />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-t from-black/70 via-transparent opacity-0 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute top-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {formatCount(book.chapters_count, CHAPTER_FORMS)}
          </span>
        </div>
        <div className="mt-2.5 space-y-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold transition-colors group-hover:text-primary">
            {book.title}
          </h3>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{genres || 'Без жанра'}</span>
            <RatingBadge value={book.rating_avg} count={book.rating_count} className="shrink-0 text-xs" />
          </div>
        </div>
      </Link>
    </article>
  )
}

export function BookCardSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

export function BookGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-6 min-[480px]:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function BookGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <BookGrid>
      {Array.from({ length: count }, (_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </BookGrid>
  )
}
