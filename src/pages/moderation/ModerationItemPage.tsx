import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Check, ExternalLink, FileQuestion, Loader2, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { BookCover } from '@/components/books/BookCover'
import { GenreChip, WorkStatusBadge } from '@/components/books/BookBadges'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageLoader } from '@/components/common/PageLoader'
import { PageContainer } from '@/components/layout/AppLayout'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { useAuth } from '@/features/auth/hooks'
import type { QueueItemDetail } from '@/features/moderation/api'
import { useModerationActions, useQueueItem } from '@/features/moderation/hooks'
import { RichText } from '@/features/reader/RichText'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { displayName, formatChapterNumber, formatCount, formatDateTime } from '@/lib/format'
import { MODERATION_KIND_LABELS, MODERATION_STATUS_LABELS, WORD_FORMS } from '@/lib/labels'

export default function ModerationItemPage() {
  const { queueId } = useParams()
  const item = useQueueItem(queueId)
  useDocumentTitle('Заявка на модерацию')

  if (item.error) {
    return (
      <PageContainer>
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
      </PageContainer>
    )
  }
  if (item.isPending) return <PageLoader />
  if (!item.data) {
    return (
      <PageContainer>
        <EmptyState
          icon={FileQuestion}
          title="Заявка не найдена"
          action={
            <Button asChild variant="secondary">
              <Link to="/moderation">К очереди</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  return <ItemView item={item.data} />
}

function ItemView({ item }: { item: QueueItemDetail }) {
  const { userId, isAdmin } = useAuth()
  const ownSubmission = item.submitted_by === userId

  return (
    <PageContainer className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/moderation">
          <ArrowLeft /> Очередь
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <header className="space-y-2">
            <p className="text-sm font-medium text-primary">{MODERATION_KIND_LABELS[item.kind]}</p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-balance">
              {item.book?.title ?? 'Произведение удалено'}
              {item.chapter ? ` · глава ${formatChapterNumber(item.chapter.number)}` : ''}
            </h1>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserAvatar profile={item.submitter} className="size-6" />
              {item.submitter ? (
                <Link to={`/profile/${item.submitter.username}`} className="hover:text-foreground">
                  {displayName(item.submitter)}
                </Link>
              ) : (
                'Автор удалён'
              )}
              · отправлено {formatDateTime(item.created_at)}
            </p>
          </header>

          {item.kind === 'book' && item.bookDetail ? <BookContent item={item} /> : null}
          {item.kind === 'book_revision' ? <BookRevisionContent item={item} /> : null}
          {item.kind === 'chapter_revision' ? <ChapterContent item={item} /> : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {item.status === 'pending' ? (
            ownSubmission && !isAdmin ? (
              <Alert>
                <AlertTitle>Это ваша заявка</AlertTitle>
                <AlertDescription>Собственные заявки обрабатывает другой модератор или администратор.</AlertDescription>
              </Alert>
            ) : (
              <DecisionPanel queueId={item.id} />
            )
          ) : (
            <div className="rounded-2xl border border-white/5 bg-card p-5">
              <p className="text-sm font-semibold">{MODERATION_STATUS_LABELS[item.status]}</p>
              {item.reviewer ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {displayName(item.reviewer)} · {formatDateTime(item.reviewed_at)}
                </p>
              ) : null}
              {item.decision_reason ? <p className="mt-3 text-sm">«{item.decision_reason}»</p> : null}
            </div>
          )}

          <div className="rounded-2xl border border-white/5 bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">Журнал заявки</h2>
            <ol className="space-y-3">
              {item.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <p>
                    <span className="font-medium">{displayName(event.actor)}</span>{' '}
                    <span className="text-muted-foreground">
                      {event.action === 'submitted'
                        ? 'отправил(а) на проверку'
                        : event.action === 'approved'
                          ? 'одобрил(а)'
                          : event.action === 'rejected'
                            ? 'отклонил(а)'
                            : 'отозвал(а)'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                  {event.reason ? <p className="mt-1 text-xs">«{event.reason}»</p> : null}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </PageContainer>
  )
}

function DecisionPanel({ queueId }: { queueId: string }) {
  const navigate = useNavigate()
  const { approve, reject } = useModerationActions()
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')
  const [text, setText] = useState('')
  const pending = approve.isPending || reject.isPending
  const reasonTooShort = mode === 'reject' && text.trim().length < 5

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const onSuccess = () => navigate('/moderation')
    if (mode === 'approve') approve.mutate({ id: queueId, note: text }, { onSuccess })
    else if (!reasonTooShort) reject.mutate({ id: queueId, reason: text }, { onSuccess })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/5 bg-card p-5">
      <h2 className="text-sm font-semibold">Решение</h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Решение">
        <Button
          type="button"
          role="radio"
          aria-checked={mode === 'approve'}
          variant={mode === 'approve' ? 'default' : 'secondary'}
          onClick={() => setMode('approve')}
          className={mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-600/90' : undefined}
        >
          <Check /> Одобрить
        </Button>
        <Button
          type="button"
          role="radio"
          aria-checked={mode === 'reject'}
          variant={mode === 'reject' ? 'destructive' : 'secondary'}
          onClick={() => setMode('reject')}
        >
          <X /> Отклонить
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="decision-text">{mode === 'approve' ? 'Комментарий (необязательно)' : 'Причина отклонения'}</Label>
        <Textarea
          id="decision-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          required={mode === 'reject'}
          minLength={mode === 'reject' ? 5 : undefined}
          placeholder={mode === 'reject' ? 'Объясните автору, что нужно исправить' : ''}
          aria-describedby="decision-hint"
        />
        <p id="decision-hint" className="text-xs text-muted-foreground">
          {mode === 'reject'
            ? 'Обязательно, не менее 5 символов. Автор увидит причину.'
            : 'Одобрение сразу опубликует материал.'}
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={pending || reasonTooShort} variant={mode === 'reject' ? 'destructive' : 'default'}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {mode === 'approve' ? 'Одобрить и опубликовать' : 'Отклонить заявку'}
      </Button>
    </form>
  )
}

function BookContent({ item }: { item: QueueItemDetail }) {
  const book = item.bookDetail
  if (!book) return null
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-white/5 bg-card p-5 sm:flex-row">
      <BookCover title={book.title} url={book.coverUrl} adult={book.is_adult} className="w-36 shrink-0" />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <WorkStatusBadge status={book.status} />
          {book.is_adult ? <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-300">18+</span> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {book.genres.map((g) => (
            <GenreChip key={g.id} name={g.name} />
          ))}
        </div>
        <p className="text-sm whitespace-pre-line">{book.description}</p>
        <p className="text-xs text-muted-foreground">
          Главы этой книги проверяются отдельными заявками.
        </p>
      </div>
    </section>
  )
}

function Field({ label, before, after }: { label: string; before: React.ReactNode; after: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="rounded-lg bg-red-500/[0.06] p-2 text-sm whitespace-pre-line">{before}</div>
      <div className="rounded-lg bg-emerald-500/[0.07] p-2 text-sm whitespace-pre-line">{after}</div>
    </div>
  )
}

function BookRevisionContent({ item }: { item: QueueItemDetail }) {
  const book = item.bookDetail
  const rev = item.bookRevision
  if (!book || !rev) return <EmptyState icon={FileQuestion} title="Правка не найдена" compact />
  return (
    <section className="space-y-4 rounded-2xl border border-white/5 bg-card p-5">
      <div className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
        <span />
        <span>Сейчас опубликовано</span>
        <span>Предлагается</span>
      </div>
      <Field label="Название" before={book.title} after={rev.title} />
      <Field label="Описание" before={book.description} after={rev.description} />
      <Field
        label="Жанры"
        before={book.genres.map((g) => g.name).join(', ') || '—'}
        after={rev.genres.map((g) => g.name).join(', ') || '—'}
      />
      <Field label="18+" before={book.is_adult ? 'Да' : 'Нет'} after={rev.is_adult ? 'Да' : 'Нет'} />
      <Field
        label="Обложка"
        before={<BookCover title={book.title} url={book.coverUrl} className="w-24" />}
        after={<BookCover title={rev.title} url={rev.coverUrl} className="w-24" />}
      />
    </section>
  )
}

function ChapterContent({ item }: { item: QueueItemDetail }) {
  const rev = item.chapterRevision
  if (!rev) return <EmptyState icon={FileQuestion} title="Версия главы не найдена" compact />
  const article = (title: string, content: typeof rev.content) => (
    <article className="rounded-2xl border border-white/5 bg-card px-4 py-6 sm:px-8">
      <h2 className="mb-6 text-center font-display text-xl font-semibold">{title || 'Без названия'}</h2>
      <RichText content={content} className="reader-prose font-serif text-[17px] leading-[1.75]" />
    </article>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{formatCount(rev.word_count, WORD_FORMS)}</span>
        {item.book?.slug && item.book.publication_state === 'published' ? (
          <Link to={`/book/${item.book.slug}`} className="inline-flex items-center gap-1 hover:text-primary">
            <ExternalLink className="size-3.5" /> Страница книги
          </Link>
        ) : (
          <span>Книга ещё не опубликована</span>
        )}
      </div>
      {item.publishedChapterRevision ? (
        <Tabs defaultValue="new" className="gap-4">
          <TabsList>
            <TabsTrigger value="new">Новая версия</TabsTrigger>
            <TabsTrigger value="old">Опубликованная</TabsTrigger>
          </TabsList>
          <TabsContent value="new">{article(rev.title, rev.content)}</TabsContent>
          <TabsContent value="old">
            {article(item.publishedChapterRevision.title, item.publishedChapterRevision.content)}
          </TabsContent>
        </Tabs>
      ) : (
        article(rev.title, rev.content)
      )}
    </div>
  )
}
