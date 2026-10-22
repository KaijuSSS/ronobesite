import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import type { BookSummary } from '@/features/books/api'
import { ErrorState } from '@/components/common/ErrorState'
import { BookCard, BookCardSkeleton } from './BookCard'

type BookShelfProps = {
  title: string
  icon: LucideIcon
  books: BookSummary[] | undefined
  isLoading: boolean
  error?: unknown
  onRetry?: () => void
  moreHref?: string
  emptyText?: string
}

/** Горизонтальная полка книг для главной страницы. */
export function BookShelf({ title, icon: Icon, books, isLoading, error, onRetry, moreHref, emptyText }: BookShelfProps) {
  const headingId = `shelf-${title.replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id={headingId} className="flex items-center gap-2.5 text-lg font-semibold sm:text-xl">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
          {title}
        </h2>
        {moreHref ? (
          <Link
            to={moreHref}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Все <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={onRetry} compact />
      ) : isLoading ? (
        <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:-mx-6 sm:gap-4 sm:px-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="w-[132px] shrink-0 sm:w-[160px]">
              <BookCardSkeleton />
            </div>
          ))}
        </div>
      ) : books && books.length > 0 ? (
        <ul className="scrollbar-none -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:gap-4 sm:px-6">
          {books.map((book) => (
            <li key={book.id} className="w-[132px] shrink-0 snap-start sm:w-[160px]">
              <BookCard book={book} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText ?? 'Здесь пока пусто.'}
        </p>
      )}
    </section>
  )
}
