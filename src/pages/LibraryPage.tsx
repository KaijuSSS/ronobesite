import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BookMarked, History, MoreVertical, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookCover } from '@/components/books/BookCover'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageContainer } from '@/components/layout/AppLayout'
import type { LibraryItem } from '@/features/library/api'
import { useLibrary, useLibraryMutations, useReadingHistory } from '@/features/library/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatChapterNumber, formatCount, formatRelative } from '@/lib/format'
import { CHAPTER_FORMS, LIBRARY_STATUS_LABELS, LIBRARY_STATUSES } from '@/lib/labels'
import type { LibraryStatus } from '@/types/database'

export default function LibraryPage() {
  useDocumentTitle('Библиотека')
  return (
    <PageContainer className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Библиотека</h1>
      <Tabs defaultValue="library" className="gap-6">
        <TabsList>
          <TabsTrigger value="library">
            <BookMarked /> Мои книги
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> История чтения
          </TabsTrigger>
        </TabsList>
        <TabsContent value="library">
          <LibraryOverview />
        </TabsContent>
        <TabsContent value="history">
          <ReadingHistory />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

type Filter = LibraryStatus | 'all'

/** Книги библиотеки с фильтром по статусу. Используется и в профиле. */
export function LibraryOverview() {
  const library = useLibrary()
  const [filter, setFilter] = useState<Filter>('reading')
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: 0, reading: 0, planned: 0, completed: 0, dropped: 0 }
    for (const item of library.data ?? []) {
      result.all++
      result[item.status]++
    }
    return result
  }, [library.data])

  if (library.error) return <ErrorState error={library.error} onRetry={() => void library.refetch()} />
  if (library.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    )
  }
  if (library.data.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        title="Библиотека пуста"
        description="Добавляйте книги кнопкой «В библиотеку» на странице произведения."
        action={
          <Button asChild>
            <Link to="/catalog">Открыть каталог</Link>
          </Button>
        }
      />
    )
  }

  const items = filter === 'all' ? library.data : library.data.filter((item) => item.status === filter)
  const filters: Filter[] = ['reading', 'planned', 'completed', 'dropped', 'all']

  return (
    <div className="space-y-5">
      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Статус">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? 'shrink-0 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground'
                : 'shrink-0 rounded-full bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
            }
          >
            {f === 'all' ? 'Все' : LIBRARY_STATUS_LABELS[f]} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={BookMarked} title="В этом разделе пока пусто" compact />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <LibraryCard key={item.book_id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function LibraryCard({ item }: { item: LibraryItem }) {
  const { setStatus, remove } = useLibraryMutations(item.book_id)
  const chapter = item.progressChapter
  return (
    <li className="flex gap-3 rounded-xl border border-white/5 bg-card p-3">
      <Link to={`/book/${item.book.slug}`} className="shrink-0">
        <BookCover title={item.book.title} url={item.book.coverUrl} adult={item.book.is_adult} blurAdult className="w-20 rounded-lg" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-1">
          <Link to={`/book/${item.book.slug}`} className="line-clamp-2 flex-1 text-sm font-semibold hover:text-primary">
            {item.book.title}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Действия">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Переместить</DropdownMenuLabel>
              {LIBRARY_STATUSES.filter((s) => s !== item.status).map((status) => (
                <DropdownMenuItem key={status} onSelect={() => setStatus.mutate(status)}>
                  {LIBRARY_STATUS_LABELS[status]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate()}>
                <Trash2 /> Убрать
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {LIBRARY_STATUS_LABELS[item.status]} · {formatCount(item.book.chapters_count, CHAPTER_FORMS)}
        </p>
        <div className="mt-auto pt-2">
          {chapter ? (
            <Button asChild size="sm" variant="secondary" className="w-full justify-start">
              <Link to={`/book/${item.book.slug}/chapter/${chapter.id}`}>
                <Play /> Продолжить · гл. {formatChapterNumber(chapter.number)}
                <span className="ml-auto text-xs text-muted-foreground">
                  {Math.round((item.progress?.position ?? 0) * 100)}%
                </span>
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost" className="w-full justify-start">
              <Link to={`/book/${item.book.slug}`}>К произведению</Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function ReadingHistory() {
  const history = useReadingHistory()
  if (history.error) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />
  if (history.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }
  if (history.data.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="История пуста"
        description="Здесь появятся книги, которые вы начали читать."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {history.data.map((item) => (
        <li key={item.book_id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-card p-2.5">
          <BookCover title={item.book.title} url={item.book.coverUrl} className="w-12 shrink-0 rounded-md" small />
          <div className="min-w-0 flex-1">
            <Link to={`/book/${item.book.slug}`} className="line-clamp-1 text-sm font-semibold hover:text-primary">
              {item.book.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {item.chapter
                ? `Глава ${formatChapterNumber(item.chapter.number)}${item.chapter.published_title ? ` · ${item.chapter.published_title}` : ''}`
                : 'Глава недоступна'}{' '}
              · {formatRelative(item.updated_at)}
            </p>
          </div>
          {item.chapter ? (
            <Button asChild size="sm" variant="secondary">
              <Link to={`/book/${item.book.slug}/chapter/${item.chapter.id}`}>
                <Play /> <span className="hidden sm:inline">Продолжить</span>
              </Link>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
