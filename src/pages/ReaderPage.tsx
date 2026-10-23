import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight, FileQuestion, List, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { AdultGate } from '@/components/books/AdultGate'
import { ChapterList } from '@/components/reader/ChapterList'
import { ReaderSettingsPanel } from '@/components/reader/ReaderSettingsPanel'
import { useAuth } from '@/features/auth/hooks'
import { useBook } from '@/features/books/hooks'
import { markChapterRead } from '@/features/chapters/api'
import { ChapterLikeButton } from '@/features/chapters/ChapterLikeButton'
import { useChapterForReading, usePublishedChapters } from '@/features/chapters/hooks'
import { ChapterStaffActions } from '@/features/moderation/ChapterStaffActions'
import { useBookProgress } from '@/features/library/hooks'
import { getLocalProgress } from '@/features/reader/local-progress'
import { measurePosition, scrollToPosition } from '@/features/reader/position'
import { RichText } from '@/features/reader/RichText'
import { READER_FONTS, READER_THEMES, useReaderSettings } from '@/features/reader/settings-store'
import { useReadingProgress } from '@/features/reader/useReadingProgress'
import { CommentsSection } from '@/features/social/CommentsSection'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatChapterNumber, formatCount, readingMinutes } from '@/lib/format'
import { WORD_FORMS } from '@/lib/labels'
import { cn } from '@/lib/utils'

export default function ReaderPage() {
  const { chapterId } = useParams()
  // Новая глава — новое состояние (позиция, панели, восстановление места).
  return <ReaderView key={chapterId} />
}

function ReaderView() {
  const { slug, chapterId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const settings = useReaderSettings()
  const theme = READER_THEMES[settings.theme]

  const book = useBook(slug)
  const chapters = usePublishedChapters(book.data?.id)
  const chapter = useChapterForReading(chapterId)
  const serverProgress = useBookProgress(book.data?.id)

  const articleRef = useRef<HTMLElement>(null)
  const [restored, setRestored] = useState(false)
  const [uiVisible, setUiVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const [tocOpen, setTocOpen] = useState(false)

  const list = useMemo(() => chapters.data ?? [], [chapters.data])
  const index = list.findIndex((c) => c.id === chapterId)
  const prev = index > 0 ? list[index - 1] : null
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null

  const title = chapter.data
    ? chapter.data.revision?.title || chapter.data.published_title || `Глава ${formatChapterNumber(chapter.data.number)}`
    : null
  useDocumentTitle(title && book.data ? `${title} · ${book.data.title}` : book.data?.title)

  const getPosition = useCallback(() => measurePosition(articleRef.current), [])
  const { report } = useReadingProgress({
    bookId: book.data?.id,
    chapterId,
    isAuthenticated,
    enabled: restored && Boolean(chapter.data),
    getPosition,
  })

  // Восстановление места чтения после загрузки текста.
  const waitingForServer = isAuthenticated && serverProgress.isPending
  useLayoutEffect(() => {
    if (restored || !chapter.data || !book.data || !articleRef.current || waitingForServer) return
    const local = getLocalProgress(book.data.id)
    const remote = serverProgress.data
    const candidates = [
      local && local.chapterId === chapterId ? { position: local.position, at: local.updatedAt } : null,
      remote && remote.chapter_id === chapterId
        ? { position: remote.position, at: new Date(remote.updated_at).getTime() }
        : null,
    ].filter((c): c is { position: number; at: number } => c !== null)
    const latest = candidates.sort((a, b) => b.at - a.at)[0]

    if (latest && latest.position > 0.01 && latest.position < 0.995) {
      scrollToPosition(articleRef.current, latest.position)
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
    setRestored(true)
  }, [book.data, chapter.data, chapterId, restored, serverProgress.data, waitingForServer])

  // Прокрутка: прогресс, автосохранение и скрытие панелей.
  useEffect(() => {
    let lastY = window.scrollY
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const y = window.scrollY
        setProgress(measurePosition(articleRef.current))
        if (settings.autoHideUi) {
          const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 120
          if (y > lastY + 6 && y > 120 && !nearBottom) setUiVisible(false)
          else if (y < lastY - 6 || nearBottom) setUiVisible(true)
        }
        lastY = y
        report()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [report, settings.autoHideUi])

  // Дочитанная глава попадает в статистику автора (один раз на читателя).
  const markedRead = useRef(false)
  useEffect(() => {
    if (!isAuthenticated || !restored || !chapterId || markedRead.current || progress < 0.9) return
    markedRead.current = true
    markChapterRead(chapterId).catch(() => {
      markedRead.current = false
    })
  }, [chapterId, isAuthenticated, progress, restored])

  // Клавиши ← и → переключают главы.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.altKey || event.ctrlKey || event.metaKey || target?.closest('input, textarea, [contenteditable]')) return
      if (event.key === 'ArrowLeft' && prev) navigate(`/book/${slug}/chapter/${prev.id}`)
      if (event.key === 'ArrowRight' && next) navigate(`/book/${slug}/chapter/${next.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, next, prev, slug])

  const themeStyle = {
    '--background': theme.bg,
    '--foreground': theme.fg,
    '--muted-foreground': theme.muted,
    '--card': theme.panel,
    '--muted': settings.theme === 'dark' ? '#1d1e26' : 'rgba(0,0,0,0.05)',
    '--border': settings.theme === 'dark' ? '#2a2b36' : 'rgba(0,0,0,0.1)',
    '--input': settings.theme === 'dark' ? '#2a2b36' : 'rgba(0,0,0,0.15)',
    '--secondary': settings.theme === 'dark' ? '#22232c' : 'rgba(0,0,0,0.06)',
    '--secondary-foreground': theme.fg,
    '--accent': settings.theme === 'dark' ? '#262735' : 'rgba(0,0,0,0.06)',
    '--accent-foreground': theme.fg,
    colorScheme: settings.theme === 'dark' ? 'dark' : 'light',
    background: theme.bg,
    color: theme.fg,
  } as CSSProperties

  const proseStyle: CSSProperties = {
    fontFamily: READER_FONTS[settings.font].stack,
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    textAlign: settings.justify ? 'justify' : 'left',
  }

  const barClass = cn(
    'fixed inset-x-0 z-40 border-white/5 backdrop-blur-xl transition-transform duration-300',
    settings.theme === 'dark' ? 'bg-[#101115]/85' : 'bg-[color:var(--card)]/90',
  )

  // На узких экранах подписи переносятся, а не вылезают за кнопку.
  const chapterNavClass = 'h-auto gap-1.5 px-3 py-3 whitespace-normal has-[>svg]:px-2.5 sm:gap-2 sm:px-5'

  const content = (() => {
    if (book.error || chapter.error) {
      return <ErrorState error={book.error ?? chapter.error} onRetry={() => void chapter.refetch()} />
    }
    if (book.isPending || chapter.isPending) {
      return (
        <div className="space-y-4" aria-label="Загрузка главы">
          <Skeleton className="mx-auto h-8 w-2/3" />
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      )
    }
    if (!book.data || !chapter.data || chapter.data.book_id !== book.data.id) {
      return (
        <EmptyState
          icon={FileQuestion}
          title="Глава не найдена"
          description="Возможно, она ещё не опубликована или была удалена."
          action={
            <Button asChild variant="secondary">
              <Link to={slug ? `/book/${slug}` : '/catalog'}>К произведению</Link>
            </Button>
          }
        />
      )
    }

    const words = chapter.data.revision?.word_count ?? chapter.data.word_count
    return (
      <AdultGate isAdult={book.data.is_adult}>
        <article ref={articleRef} aria-labelledby="chapter-title" onClick={() => setUiVisible((v) => !v)}>
          <header className="mb-10 text-center">
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Глава {formatChapterNumber(chapter.data.number)}
            </p>
            <h1 id="chapter-title" className="mt-2 font-display text-2xl leading-snug font-semibold text-balance sm:text-3xl">
              {title}
            </h1>
            <p className="mt-3 text-xs text-[color:var(--muted-foreground)]">
              {formatCount(words, WORD_FORMS)} · ~{readingMinutes(words)} мин
            </p>
          </header>
          <RichText content={chapter.data.revision?.content} className="reader-prose" />
        </article>

        <div className="mt-14 space-y-6">
          <ChapterLikeButton chapterId={chapter.data.id} />
          <ChapterStaffActions bookSlug={book.data.slug} chapterId={chapter.data.id} />
        </div>

        <nav aria-label="Переход между главами" className="mt-10 grid grid-cols-2 gap-3 font-sans">
          {prev ? (
            <Button asChild variant="secondary" size="lg" className={cn(chapterNavClass, 'justify-start')}>
              <Link to={`/book/${slug}/chapter/${prev.id}`}>
                <ChevronLeft />
                <span className="min-w-0 text-left">
                  <span className="block text-xs opacity-70">Предыдущая</span>
                  <span className="block truncate">Глава {formatChapterNumber(prev.number)}</span>
                </span>
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {next ? (
            <Button asChild size="lg" className={cn(chapterNavClass, 'bg-brand-gradient justify-end border-0 text-white')}>
              <Link to={`/book/${slug}/chapter/${next.id}`}>
                <span className="min-w-0 text-right">
                  <span className="block text-xs opacity-80">Следующая</span>
                  <span className="block truncate">Глава {formatChapterNumber(next.number)}</span>
                </span>
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="lg" className={cn(chapterNavClass, 'justify-end')}>
              <Link to={`/book/${slug}`}>
                <span className="min-w-0 text-right">
                  <span className="block text-xs opacity-70">Последняя глава</span>
                  <span className="block">К произведению</span>
                </span>
              </Link>
            </Button>
          )}
        </nav>

        <div className="mt-16 border-t border-[color:var(--border)] pt-10 font-sans">
          <CommentsSection scope={{ bookId: book.data.id, chapterId: chapter.data.id }} title="Обсуждение главы" />
        </div>
      </AdultGate>
    )
  })()

  return (
    <div style={themeStyle} className="min-h-dvh overflow-x-clip transition-colors duration-300">
      <header
        className={cn(barClass, 'top-0 border-b', !uiVisible && '-translate-y-full')}
        aria-hidden={!uiVisible ? true : undefined}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 sm:px-4">
          <Button asChild variant="ghost" size="icon" aria-label="К странице произведения">
            <Link to={slug ? `/book/${slug}` : '/'}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{book.data?.title ?? ' '}</p>
            {chapter.data ? (
              <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                Глава {formatChapterNumber(chapter.data.number)}
              </p>
            ) : null}
          </div>
          <Sheet open={tocOpen} onOpenChange={setTocOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Список глав">
                <List />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-md">
              <SheetHeader>
                <SheetTitle>Оглавление</SheetTitle>
                <SheetDescription>{book.data?.title}</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
                <ChapterList
                  bookSlug={slug ?? ''}
                  chapters={list}
                  currentId={chapterId}
                  onNavigate={() => setTocOpen(false)}
                  dense
                />
              </div>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Настройки чтения">
                <Settings2 />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Настройки чтения</SheetTitle>
                <SheetDescription>Сохраняются на этом устройстве.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6">
                <ReaderSettingsPanel />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="h-0.5 bg-transparent" aria-hidden>
          <div className="bg-brand-gradient h-full transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <main className="px-5 pt-24 pb-32 sm:px-8" style={{ maxWidth: settings.width + 64, margin: '0 auto' }}>
        <div style={proseStyle}>{content}</div>
      </main>

      <footer
        className={cn(barClass, 'safe-bottom bottom-0 border-t', !uiVisible && 'translate-y-full')}
        aria-hidden={!uiVisible ? true : undefined}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
          <Button
            variant="ghost"
            disabled={!prev}
            onClick={() => prev && navigate(`/book/${slug}/chapter/${prev.id}`)}
            aria-label="Предыдущая глава"
          >
            <ChevronLeft /> <span className="hidden sm:inline">Назад</span>
          </Button>
          <span className="text-sm text-[color:var(--muted-foreground)] tabular-nums">
            {index >= 0 ? `${index + 1} / ${list.length}` : ''} · {Math.round(progress * 100)}%
          </span>
          <Button
            variant="ghost"
            disabled={!next}
            onClick={() => next && navigate(`/book/${slug}/chapter/${next.id}`)}
            aria-label="Следующая глава"
          >
            <span className="hidden sm:inline">Вперёд</span> <ChevronRight />
          </Button>
        </div>
      </footer>
    </div>
  )
}
