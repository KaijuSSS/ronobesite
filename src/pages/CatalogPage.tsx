import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { RotateCcw, Search, SearchX, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { BookCard, BookGrid, BookGridSkeleton } from '@/components/books/BookCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { Pagination } from '@/components/common/Pagination'
import { PageContainer } from '@/components/layout/AppLayout'
import { BOOK_SORT_LABELS, type BookSort } from '@/features/books/api'
import { parseCatalogParams, serializeCatalogParams, type CatalogParams } from '@/features/books/catalog-params'
import { useBookList, useGenres } from '@/features/books/hooks'
import { formatCount } from '@/lib/format'
import { WORK_STATUS_LABELS, WORK_STATUSES } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { GenreRow, WorkStatus } from '@/types/database'

const PAGE_SIZE = 24

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => parseCatalogParams(searchParams), [searchParams])
  const genres = useGenres()

  const genreIds = useMemo(() => {
    if (!genres.data) return []
    return genres.data.filter((g) => params.genres.includes(g.slug)).map((g) => g.id)
  }, [genres.data, params.genres])

  const books = useBookList(
    {
      query: params.q,
      genreIds,
      statuses: params.statuses,
      sort: params.sort,
      page: params.page,
      pageSize: PAGE_SIZE,
    },
    // Ждём жанры, если фильтр по жанрам задан в адресе.
    { enabled: params.genres.length === 0 || Boolean(genres.data) },
  )

  function update(patch: Partial<CatalogParams>) {
    const next = { ...params, page: 1, ...patch }
    setSearchParams(serializeCatalogParams(next))
  }

  function resetFilters() {
    setSearchParams(serializeCatalogParams({ q: '', genres: [], statuses: [], sort: params.sort, page: 1 }))
  }

  function changePage(page: number) {
    setSearchParams(serializeCatalogParams({ ...params, page }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeFilters = params.genres.length + params.statuses.length + (params.q ? 1 : 0)
  const filters = (
    <CatalogFilters
      genres={genres.data}
      genresLoading={genres.isPending}
      params={params}
      onChange={update}
      onReset={resetFilters}
      activeFilters={activeFilters}
    />
  )

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Каталог</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {books.data ? `Найдено: ${formatCount(books.data.total, ['произведение', 'произведения', 'произведений'])}` : ' '}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" className="lg:hidden">
                <SlidersHorizontal /> Фильтры
                {activeFilters > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeFilters}</span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Фильтры</SheetTitle>
                <SheetDescription>Уточните поиск по жанрам и статусу.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">{filters}</div>
            </SheetContent>
          </Sheet>
          <Select value={params.sort} onValueChange={(value) => update({ sort: value as BookSort })}>
            <SelectTrigger className="w-[200px]" aria-label="Сортировка">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BOOK_SORT_LABELS) as BookSort[]).map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {BOOK_SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Фильтры каталога" className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-white/5 bg-card p-5">{filters}</div>
        </aside>

        <section aria-label="Результаты" className="min-w-0">
          {books.error ? (
            <ErrorState error={books.error} onRetry={() => void books.refetch()} />
          ) : books.isPending ? (
            <BookGridSkeleton count={12} />
          ) : books.data && books.data.items.length > 0 ? (
            <div className={cn('space-y-10 transition-opacity', books.isPlaceholderData && 'opacity-60')}>
              <BookGrid className="lg:grid-cols-4 xl:grid-cols-5">
                {books.data.items.map((book) => (
                  <BookCard key={book.id} book={book} />
                ))}
              </BookGrid>
              <Pagination page={params.page} totalPages={books.data.totalPages} onPageChange={changePage} />
            </div>
          ) : (
            <EmptyState
              icon={SearchX}
              title="Ничего не найдено"
              description={
                activeFilters > 0
                  ? 'Попробуйте изменить запрос или убрать часть фильтров.'
                  : 'В каталоге пока нет опубликованных произведений.'
              }
              action={
                activeFilters > 0 ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    <RotateCcw /> Сбросить фильтры
                  </Button>
                ) : null
              }
            />
          )}
        </section>
      </div>
    </PageContainer>
  )
}

type CatalogFiltersProps = {
  genres: GenreRow[] | undefined
  genresLoading: boolean
  params: CatalogParams
  onChange: (patch: Partial<CatalogParams>) => void
  onReset: () => void
  activeFilters: number
}

/** Поле поиска; key={q} пересоздаёт его при смене запроса в адресе. */
function QueryForm({ initial, onSubmit }: { initial: string; onSubmit: (q: string) => void }) {
  const [query, setQuery] = useState(initial)

  function submitQuery(event: FormEvent) {
    event.preventDefault()
    onSubmit(query)
  }

  return (
    <form onSubmit={submitQuery} role="search" className="space-y-2">
      <Label htmlFor="catalog-query">Название</Label>
      <div className="relative">
        <Input
          id="catalog-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию"
          className="pr-10"
          maxLength={100}
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label="Искать"
        >
          <Search />
        </Button>
      </div>
    </form>
  )
}

function CatalogFilters({ genres, genresLoading, params, onChange, onReset, activeFilters }: CatalogFiltersProps) {
  function toggleGenre(slug: string) {
    const next = params.genres.includes(slug) ? params.genres.filter((g) => g !== slug) : [...params.genres, slug]
    onChange({ genres: next })
  }

  function toggleStatus(status: WorkStatus) {
    const next = params.statuses.includes(status)
      ? params.statuses.filter((s) => s !== status)
      : [...params.statuses, status]
    onChange({ statuses: next })
  }

  return (
    <div className="space-y-6">
      <QueryForm key={params.q} initial={params.q} onSubmit={(q) => onChange({ q })} />

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium">Статус</legend>
        {WORK_STATUSES.map((status) => (
          <div key={status} className="flex items-center gap-2.5">
            <Checkbox
              id={`status-${status}`}
              checked={params.statuses.includes(status)}
              onCheckedChange={() => toggleStatus(status)}
            />
            <Label htmlFor={`status-${status}`} className="font-normal">
              {WORK_STATUS_LABELS[status]}
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-medium">Жанры</legend>
        {genresLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-20 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {genres?.map((genre) => {
              const active = params.genres.includes(genre.slug)
              return (
                <button
                  key={genre.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleGenre(genre.slug)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white/[0.06] text-muted-foreground hover:bg-white/10 hover:text-foreground',
                  )}
                >
                  {genre.name}
                </button>
              )
            })}
          </div>
        )}
        {params.genres.length > 1 ? (
          <p className="mt-2 text-xs text-muted-foreground">Показываются книги со всеми выбранными жанрами.</p>
        ) : null}
      </fieldset>

      {activeFilters > 0 ? (
        <Button variant="ghost" className="w-full" onClick={onReset}>
          <RotateCcw /> Сбросить фильтры
        </Button>
      ) : null}
    </div>
  )
}
