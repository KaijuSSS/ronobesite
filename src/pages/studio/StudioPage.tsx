import { Link } from 'react-router'
import { FilePlus2, Inbox, PenSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookCover } from '@/components/books/BookCover'
import { PublicationBadge, WorkStatusBadge } from '@/components/books/BookBadges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageContainer } from '@/components/layout/AppLayout'
import { useMyBooks, useMySubmissions } from '@/features/studio/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatChapterNumber, formatCount, formatRelative } from '@/lib/format'
import { CHAPTER_FORMS, MODERATION_KIND_LABELS, MODERATION_STATUS_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'

export default function StudioPage() {
  useDocumentTitle('Студия автора')
  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Студия автора</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Создавайте произведения и главы. Публикация — после одобрения модератором.
          </p>
        </div>
        <Button asChild className="bg-brand-gradient border-0 text-white">
          <Link to="/studio/new">
            <FilePlus2 /> Новое произведение
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="books" className="gap-6">
        <TabsList>
          <TabsTrigger value="books">
            <PenSquare /> Произведения
          </TabsTrigger>
          <TabsTrigger value="submissions">
            <Inbox /> Мои заявки
          </TabsTrigger>
        </TabsList>
        <TabsContent value="books">
          <MyBooks />
        </TabsContent>
        <TabsContent value="submissions">
          <MySubmissions />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function MyBooks() {
  const books = useMyBooks()
  if (books.error) return <ErrorState error={books.error} onRetry={() => void books.refetch()} />
  if (books.isPending) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    )
  }
  if (books.data.length === 0) {
    return (
      <EmptyState
        icon={PenSquare}
        title="У вас пока нет произведений"
        description="Создайте первое произведение: добавьте описание, обложку и главы, затем отправьте на проверку."
        action={
          <Button asChild>
            <Link to="/studio/new">
              <FilePlus2 /> Создать
            </Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {books.data.map((book) => (
        <li key={book.id}>
          <Link
            to={`/studio/books/${book.id}`}
            className="group flex gap-4 rounded-2xl border border-white/5 bg-card p-3 transition-colors hover:border-primary/40"
          >
            <BookCover title={book.title} url={book.coverUrl} className="w-20 shrink-0 rounded-lg" small />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <h2 className="line-clamp-2 font-semibold group-hover:text-primary">{book.title}</h2>
              <div className="flex flex-wrap gap-1.5">
                <PublicationBadge state={book.publication_state} />
                <WorkStatusBadge status={book.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCount(book.chapters_count, CHAPTER_FORMS)} опубликовано · изменено {formatRelative(book.updated_at)}
              </p>
              {book.publication_state === 'rejected' && book.rejection_reason ? (
                <p className="line-clamp-2 text-xs text-red-300">Причина: {book.rejection_reason}</p>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const STATUS_STYLES = {
  pending: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-red-500/15 text-red-300',
  cancelled: 'bg-zinc-500/20 text-zinc-300',
} as const

function MySubmissions() {
  const submissions = useMySubmissions()
  if (submissions.error) return <ErrorState error={submissions.error} onRetry={() => void submissions.refetch()} />
  if (submissions.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    )
  }
  if (submissions.data.length === 0) {
    return <EmptyState icon={Inbox} title="Заявок пока нет" description="Здесь будет история проверок ваших текстов." />
  }
  return (
    <ul className="space-y-2">
      {submissions.data.map((item) => {
        const href =
          item.kind === 'chapter_revision' && item.chapter
            ? `/studio/books/${item.book_id}/chapters/${item.chapter.id}`
            : `/studio/books/${item.book_id}`
        return (
          <li key={item.id}>
            <Link
              to={href}
              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {item.book?.title ?? 'Произведение удалено'}
                  {item.chapter ? ` · глава ${formatChapterNumber(item.chapter.number)}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {MODERATION_KIND_LABELS[item.kind]} · {formatRelative(item.created_at)}
                </p>
                {item.status === 'rejected' && item.decision_reason ? (
                  <p className="mt-1 text-xs text-red-300">Причина: {item.decision_reason}</p>
                ) : null}
              </div>
              <span className={cn('self-start rounded-md px-2 py-0.5 text-xs font-medium sm:self-center', STATUS_STYLES[item.status])}>
                {MODERATION_STATUS_LABELS[item.status]}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
