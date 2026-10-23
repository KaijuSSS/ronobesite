import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  BookOpen,
  BookmarkPlus,
  CalendarClock,
  Check,
  ChevronDown,
  Flag,
  FileQuestion,
  Library,
  ListOrdered,
  PenSquare,
  Play,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdultGate } from '@/components/books/AdultGate'
import { BookCover } from '@/components/books/BookCover'
import { GenreChip, PublicationBadge, RatingBadge, WorkStatusBadge } from '@/components/books/BookBadges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageContainer } from '@/components/layout/AppLayout'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { ChapterList } from '@/components/reader/ChapterList'
import { useAuth } from '@/features/auth/hooks'
import type { BookDetail } from '@/features/books/api'
import { useBook } from '@/features/books/hooks'
import { usePublishedChapters } from '@/features/chapters/hooks'
import { useBookProgress, useLibraryEntry, useLibraryMutations } from '@/features/library/hooks'
import { FollowButton } from '@/features/profile/FollowButton'
import { getLocalProgress } from '@/features/reader/local-progress'
import { CommentsSection } from '@/features/social/CommentsSection'
import { ReportDialog } from '@/features/social/ReportDialog'
import { ReviewsSection } from '@/features/social/ReviewsSection'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { displayName, formatChapterNumber, formatCount, formatDate, formatRating } from '@/lib/format'
import { CHAPTER_FORMS, LIBRARY_STATUS_LABELS, LIBRARY_STATUSES, RATING_FORMS, READER_FORMS } from '@/lib/labels'
import { cn } from '@/lib/utils'

export default function BookPage() {
  const { slug } = useParams()
  const book = useBook(slug)
  useDocumentTitle(book.data?.title)

  if (book.error) {
    return (
      <PageContainer>
        <ErrorState error={book.error} onRetry={() => void book.refetch()} />
      </PageContainer>
    )
  }
  if (book.isPending) return <BookPageSkeleton />
  if (!book.data) {
    return (
      <PageContainer>
        <EmptyState
          icon={FileQuestion}
          title="Произведение не найдено"
          description="Возможно, ссылка устарела, книга ещё не опубликована или была скрыта."
          action={
            <Button asChild variant="secondary">
              <Link to="/catalog">В каталог</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <AdultGate isAdult={book.data.is_adult}>
      <BookView book={book.data} />
    </AdultGate>
  )
}

function BookView({ book }: { book: BookDetail }) {
  const { isAuthenticated, userId, canWrite } = useAuth()
  const chapters = usePublishedChapters(book.id)
  const progress = useBookProgress(book.id)
  const [expanded, setExpanded] = useState(false)
  const isAuthor = userId === book.author_id

  const list = chapters.data ?? []
  const first = list[0]
  const savedChapterId = isAuthenticated ? progress.data?.chapter_id : getLocalProgress(book.id)?.chapterId
  const continueChapter = savedChapterId ? list.find((c) => c.id === savedChapterId) : undefined
  const longDescription = book.description.length > 420

  return (
    <>
      <div className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt="" className="size-full scale-110 object-cover opacity-25 blur-3xl" />
          ) : (
            <div className="bg-brand-gradient size-full opacity-15 blur-3xl" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        </div>

        <PageContainer className="pt-8 sm:pt-12">
          <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] md:gap-10">
            <div className="mx-auto w-44 sm:mx-0 sm:w-full">
              <BookCover title={book.title} url={book.coverUrl} adult={book.is_adult} className="rounded-2xl shadow-2xl" />
            </div>

            <div className="min-w-0 space-y-5">
              <div className="space-y-3 text-center sm:text-left">
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <WorkStatusBadge status={book.status} />
                  {book.publication_state !== 'published' ? <PublicationBadge state={book.publication_state} /> : null}
                </div>
                <h1 className="font-display text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl lg:text-4xl">
                  {book.title}
                </h1>
                {book.author ? (
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                    <Link
                      to={`/profile/${book.author.username}`}
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <UserAvatar profile={book.author} className="size-6" />
                      {displayName(book.author)}
                    </Link>
                    <FollowButton authorId={book.author.id} size="sm" />
                  </div>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={ListOrdered} label="Главы" value={String(book.chapters_count)} />
                <Stat
                  icon={BookOpen}
                  label="Рейтинг"
                  value={<RatingBadge value={book.rating_avg} count={book.rating_count} className="text-base" />}
                  hint={book.rating_count ? formatCount(book.rating_count, RATING_FORMS) : 'нет оценок'}
                />
                <Stat icon={Users} label="В библиотеках" value={formatCount(book.library_count, READER_FORMS)} />
                <Stat icon={CalendarClock} label="Обновлено" value={formatDate(book.last_chapter_at ?? book.published_at)} />
              </dl>

              <div className="flex flex-wrap gap-2">
                {continueChapter ? (
                  <Button asChild size="lg" className="bg-brand-gradient border-0 text-white">
                    <Link to={`/book/${book.slug}/chapter/${continueChapter.id}`}>
                      <Play /> Продолжить · гл. {formatChapterNumber(continueChapter.number)}
                    </Link>
                  </Button>
                ) : null}
                {first ? (
                  <Button
                    asChild
                    size="lg"
                    variant={continueChapter ? 'secondary' : 'default'}
                    className={continueChapter ? undefined : 'bg-brand-gradient border-0 text-white'}
                  >
                    <Link to={`/book/${book.slug}/chapter/${first.id}`}>
                      <BookOpen /> Начать читать
                    </Link>
                  </Button>
                ) : (
                  <Button size="lg" disabled>
                    <BookOpen /> Глав пока нет
                  </Button>
                )}
                {isAuthenticated ? <LibraryButton bookId={book.id} /> : null}
                {isAuthor ? (
                  canWrite ? (
                    <Button asChild size="lg" variant="ghost">
                      <Link to={`/studio/books/${book.id}`}>
                        <PenSquare /> Редактировать
                      </Link>
                    </Button>
                  ) : null
                ) : isAuthenticated ? (
                  <ReportDialog
                    targetType="book"
                    targetId={book.id}
                    trigger={
                      <Button size="lg" variant="ghost" aria-label="Пожаловаться на произведение">
                        <Flag />
                      </Button>
                    }
                  />
                ) : null}
              </div>

              {book.genres.length ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Жанры">
                  {book.genres.map((genre) => (
                    <li key={genre.id}>
                      <GenreChip name={genre.name} slug={genre.slug} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {book.description ? (
                <div>
                  <p
                    className={cn(
                      'text-[15px] leading-relaxed whitespace-pre-line text-foreground/85',
                      !expanded && longDescription && 'line-clamp-6',
                    )}
                  >
                    {book.description}
                  </p>
                  {longDescription ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="mt-1 text-sm font-medium text-primary hover:underline"
                      aria-expanded={expanded}
                    >
                      {expanded ? 'Свернуть' : 'Читать полностью'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </PageContainer>
      </div>

      <PageContainer className="pt-0">
        <Tabs defaultValue="chapters" className="gap-6">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="chapters">
              Главы <span className="text-muted-foreground">{list.length}</span>
            </TabsTrigger>
            <TabsTrigger value="reviews">
              Отзывы{' '}
              <span className="text-muted-foreground">{book.rating_count ? formatRating(book.rating_avg, book.rating_count) : ''}</span>
            </TabsTrigger>
            <TabsTrigger value="comments">Обсуждение</TabsTrigger>
          </TabsList>

          <TabsContent value="chapters">
            {chapters.error ? (
              <ErrorState error={chapters.error} onRetry={() => void chapters.refetch()} compact />
            ) : chapters.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={ListOrdered}
                title="Опубликованных глав пока нет"
                description="Как только автор опубликует первую главу и её одобрит модератор, она появится здесь."
                compact
              />
            ) : (
              <div className="rounded-2xl border border-white/5 bg-card p-2">
                <p className="px-3 pt-2 pb-3 text-sm text-muted-foreground">{formatCount(list.length, CHAPTER_FORMS)}</p>
                <ChapterList
                  bookSlug={book.slug}
                  chapters={list}
                  currentId={continueChapter?.id}
                  readUpTo={continueChapter?.number}
                  showDates
                  descending={list.length > 20}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="max-w-3xl">
            <ReviewsSection bookId={book.id} bookSlug={book.slug} authorId={book.author_id} />
          </TabsContent>

          <TabsContent value="comments" className="max-w-3xl">
            <p className="mb-4 text-sm text-muted-foreground">
              Здесь обсуждают произведение целиком. Комментарии к отдельной главе — в конце каждой главы.
            </p>
            <CommentsSection scope={{ bookId: book.id, chapterId: null }} title="Обсуждение произведения" />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BookOpen
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-card/70 px-3 py-2.5 backdrop-blur">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold">
        {value}
        {hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  )
}

function LibraryButton({ bookId }: { bookId: string }) {
  const entry = useLibraryEntry(bookId)
  const { setStatus, remove } = useLibraryMutations(bookId)
  const current = entry.data?.status
  const busy = setStatus.isPending || remove.isPending

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="lg" variant="secondary" disabled={entry.isPending || busy}>
          {current ? <Library /> : <BookmarkPlus />}
          {current ? LIBRARY_STATUS_LABELS[current] : 'В библиотеку'}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {LIBRARY_STATUSES.map((status) => (
          <DropdownMenuItem key={status} onSelect={() => setStatus.mutate(status)}>
            {current === status ? <Check /> : <span className="size-4" />}
            {LIBRARY_STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
        {current ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate()}>
              <Trash2 /> Убрать из библиотеки
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BookPageSkeleton() {
  return (
    <PageContainer className="pt-8 sm:pt-12">
      <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)] md:gap-10">
        <Skeleton className="mx-auto aspect-[2/3] w-44 rounded-2xl sm:w-full" />
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </PageContainer>
  )
}
