import { Link } from 'react-router'
import { BookOpen, Clock, Flame, KeyRound, Library, PenSquare, Sparkles, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageLoader } from '@/components/common/PageLoader'
import { EmptyState } from '@/components/common/EmptyState'
import { BookShelf } from '@/components/books/BookShelf'
import { BookCover } from '@/components/books/BookCover'
import { SearchBox } from '@/components/layout/SearchBox'
import { PageContainer } from '@/components/layout/AppLayout'
import { useAuth, useCatalogAccess } from '@/features/auth/hooks'
import { useBookList, useGenres } from '@/features/books/hooks'
import { useReadingHistory } from '@/features/library/hooks'
import { displayName, formatChapterNumber } from '@/lib/format'

export default function HomePage() {
  const access = useCatalogAccess()
  if (access.isLoading) return <PageLoader />
  if (!access.canRead) return <GuestLanding />
  return <MemberHome />
}

function GuestLanding() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute top-[30%] right-[-10%] h-[320px] w-[420px] rounded-full bg-blue-600/20 blur-[100px]" />
      </div>
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:py-28">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3.5 text-primary" aria-hidden /> Доступ по приглашениям
        </span>
        <h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          Истории, которые <span className="text-brand-gradient">хочется дочитать</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
          RanobeSite — закрытая площадка для чтения и публикации ранобэ, веб-новелл и рассказов. Войдите, чтобы открыть
          каталог, или зарегистрируйтесь по коду приглашения.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-brand-gradient border-0 px-7">
            <Link to="/login">Войти</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="px-7">
            <Link to="/register">У меня есть приглашение</Link>
          </Button>
        </div>
        <ul className="mt-14 grid w-full gap-3 text-left sm:grid-cols-3">
          {[
            { icon: BookOpen, title: 'Удобная читалка', text: 'Темы, шрифты, ширина текста и сохранение места чтения.' },
            { icon: PenSquare, title: 'Студия автора', text: 'Пишите главы в редакторе с автосохранением черновиков.' },
            { icon: Library, title: 'Своя библиотека', text: 'Статусы «Читаю», «В планах», история и продолжение чтения.' },
          ].map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-white/5 bg-card/70 p-4 backdrop-blur">
              <Icon className="mb-3 size-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function MemberHome() {
  const { profile, isAuthenticated, canWrite } = useAuth()
  const popular = useBookList({ sort: 'popular', pageSize: 12 })
  const updated = useBookList({ sort: 'updated', pageSize: 12 })
  const fresh = useBookList({ sort: 'new', pageSize: 12 })
  const catalogEmpty = !updated.isPending && !updated.error && (updated.data?.total ?? 0) === 0

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/5">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-[10%] h-[360px] w-[560px] rounded-full bg-violet-600/20 blur-[110px]" />
          <div className="absolute -top-20 right-[5%] h-[300px] w-[420px] rounded-full bg-blue-600/15 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-sm font-medium text-primary">
            {isAuthenticated && profile ? `С возвращением, ${displayName(profile)}!` : 'Добро пожаловать!'}
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">
            Что почитаем сегодня?
          </h1>
          <SearchBox size="lg" className="mt-6 max-w-xl" />
        </div>
      </section>

      <PageContainer className="space-y-12">
        {isAuthenticated ? <ContinueReading /> : null}

        {catalogEmpty ? (
          <EmptyState
            icon={BookOpen}
            title="Каталог пока пуст"
            description={
              canWrite
                ? 'Здесь появятся произведения, как только авторы опубликуют их и модератор одобрит. Станьте первым!'
                : 'Здесь появятся произведения, как только авторы опубликуют их и модератор одобрит.'
            }
            action={
              canWrite ? (
                <Button asChild className="bg-brand-gradient border-0">
                  <Link to="/studio/new">
                    <PenSquare /> Создать произведение
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <BookShelf
              title="Популярное"
              icon={Flame}
              books={popular.data?.items}
              isLoading={popular.isPending}
              error={popular.error}
              onRetry={() => void popular.refetch()}
              moreHref="/catalog?sort=popular"
            />
            <BookShelf
              title="Недавно обновлённые"
              icon={Clock}
              books={updated.data?.items}
              isLoading={updated.isPending}
              error={updated.error}
              onRetry={() => void updated.refetch()}
              moreHref="/catalog?sort=updated"
            />
            <BookShelf
              title="Новые произведения"
              icon={Sparkles}
              books={fresh.data?.items}
              isLoading={fresh.isPending}
              error={fresh.error}
              onRetry={() => void fresh.refetch()}
              moreHref="/catalog?sort=new"
            />
            <GenreCollections />
          </>
        )}
      </PageContainer>
    </>
  )
}

function ContinueReading() {
  const history = useReadingHistory()
  const items = (history.data ?? []).filter((item) => item.chapter).slice(0, 4)
  if (history.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }
  if (items.length === 0) return null

  return (
    <section aria-labelledby="continue-heading" className="space-y-4">
      <h2 id="continue-heading" className="flex items-center gap-2.5 text-lg font-semibold sm:text-xl">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="size-4" aria-hidden />
        </span>
        Продолжить чтение
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.book_id}>
            <Link
              to={`/book/${item.book.slug}/chapter/${item.chapter?.id}`}
              className="group flex gap-3 rounded-xl border border-white/5 bg-card p-2.5 transition-colors hover:border-primary/40"
            >
              <BookCover title={item.book.title} url={item.book.coverUrl} className="w-14 shrink-0 rounded-lg" small />
              <div className="min-w-0 flex-1 py-0.5">
                <p className="line-clamp-2 text-sm font-semibold group-hover:text-primary">{item.book.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Глава {formatChapterNumber(item.chapter?.number ?? 0)}
                  {item.chapter?.published_title ? ` · ${item.chapter.published_title}` : ''}
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="bg-brand-gradient h-full rounded-full"
                    style={{ width: `${Math.round(item.position * 100)}%` }}
                  />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function GenreCollections() {
  const genres = useGenres()
  if (genres.isPending) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-36 rounded-xl" />
        ))}
      </div>
    )
  }
  if (!genres.data?.length) return null

  return (
    <section aria-labelledby="genres-heading" className="space-y-4">
      <h2 id="genres-heading" className="flex items-center gap-2.5 text-lg font-semibold sm:text-xl">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Tags className="size-4" aria-hidden />
        </span>
        Подборки по жанрам
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {genres.data.map((genre, index) => (
          <li key={genre.id}>
            <Link
              to={`/catalog?genres=${genre.slug}`}
              className="group relative flex h-16 items-center overflow-hidden rounded-xl border border-white/5 bg-card px-4 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <span
                aria-hidden
                className="absolute -right-6 -bottom-8 size-20 rounded-full opacity-30 blur-xl transition-opacity group-hover:opacity-60"
                style={{ background: index % 2 === 0 ? 'var(--brand-violet)' : 'var(--brand-blue)' }}
              />
              <span className="relative">{genre.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
