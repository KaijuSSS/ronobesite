import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  FilePlus2,
  FileQuestion,
  Heart,
  Loader2,
  PencilLine,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { BookCover } from '@/components/books/BookCover'
import { GenreChip, PublicationBadge, WorkStatusBadge } from '@/components/books/BookBadges'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageLoader } from '@/components/common/PageLoader'
import { PageContainer } from '@/components/layout/AppLayout'
import {
  cancelSubmission,
  createChapter,
  deleteBook,
  discardBookRevision,
  setBookStatus,
  startBookRevision,
  submitBook,
  submitBookRevision,
  updateBookRevision,
  updateDraftBook,
  type BookFormValues,
  type StudioBookDetail,
} from '@/features/studio/api'
import { BookForm } from '@/features/studio/BookForm'
import { studioKeys, useChapterStats, useStudioBook, useStudioChapters } from '@/features/studio/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorMessage } from '@/lib/errors'
import { formatChapterNumber, formatCount, formatRelative } from '@/lib/format'
import { LIKE_FORMS, READ_FORMS, WORD_FORMS, WORK_STATUS_LABELS, WORK_STATUSES } from '@/lib/labels'
import type { WorkStatus } from '@/types/database'

export default function StudioBookPage() {
  const { bookId } = useParams()
  const book = useStudioBook(bookId)
  useDocumentTitle(book.data ? `Студия: ${book.data.title}` : 'Студия')

  if (book.error) {
    return (
      <PageContainer>
        <ErrorState error={book.error} onRetry={() => void book.refetch()} />
      </PageContainer>
    )
  }
  if (book.isPending) return <PageLoader />
  if (!book.data) {
    return (
      <PageContainer>
        <EmptyState
          icon={FileQuestion}
          title="Произведение не найдено"
          description="Оно удалено или принадлежит другому автору."
          action={
            <Button asChild variant="secondary">
              <Link to="/studio">В студию</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  return <StudioBookView book={book.data} />
}

function useInvalidateStudio(bookId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: studioKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    void queryClient.invalidateQueries({ queryKey: studioKeys.book(bookId) })
  }
}

function StudioBookView({ book }: { book: StudioBookDetail }) {
  const navigate = useNavigate()
  const invalidate = useInvalidateStudio(book.id)
  const editable = book.publication_state === 'draft' || book.publication_state === 'rejected'
  const bookQueue = book.pendingQueue.find((q) => q.kind === 'book')

  const submit = useMutation({
    mutationFn: () => submitBook(book.id),
    onSuccess: () => {
      toast.success('Отправлено на проверку')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const cancel = useMutation({
    mutationFn: (queueId: string) => cancelSubmission(queueId),
    onSuccess: () => {
      toast.success('Заявка отозвана')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: () => {
      toast.success('Черновик удалён')
      invalidate()
      navigate('/studio', { replace: true })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const status = useMutation({
    mutationFn: (value: WorkStatus) => setBookStatus(book.id, value),
    onSuccess: () => {
      toast.success('Статус выпуска обновлён')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const formInitial: BookFormValues = {
    title: book.title,
    description: book.description,
    status: book.status,
    is_adult: book.is_adult,
    cover_path: book.cover_path,
    genre_ids: book.genres.map((g) => g.id),
  }

  return (
    <PageContainer className="max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/studio">
            <ArrowLeft /> Студия
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-balance">{book.title}</h1>
            <div className="flex flex-wrap gap-1.5">
              <PublicationBadge state={book.publication_state} />
              <WorkStatusBadge status={book.status} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {book.publication_state === 'published' ? (
              <Button asChild variant="secondary">
                <Link to={`/book/${book.slug}`}>
                  <ExternalLink /> Страница книги
                </Link>
              </Button>
            ) : null}
            {editable ? (
              <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="bg-brand-gradient border-0 text-white">
                {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                {book.publication_state === 'rejected' ? 'Отправить повторно' : 'Отправить на проверку'}
              </Button>
            ) : null}
            {bookQueue ? (
              <Button variant="secondary" onClick={() => cancel.mutate(bookQueue.id)} disabled={cancel.isPending}>
                <Undo2 /> Отозвать заявку
              </Button>
            ) : null}
            {editable && !book.published_at ? (
              <ConfirmDialog
                title="Удалить черновик?"
                description="Произведение и все его главы будут удалены без возможности восстановления."
                confirmLabel="Удалить"
                destructive
                onConfirm={() => remove.mutate()}
                trigger={
                  <Button variant="ghost" aria-label="Удалить черновик">
                    <Trash2 />
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </div>

      {book.publication_state === 'rejected' && book.rejection_reason ? (
        <Alert variant="destructive">
          <AlertTitle>Модератор отклонил произведение</AlertTitle>
          <AlertDescription>
            <p>{book.rejection_reason}</p>
            <p className="mt-1">Исправьте замечания и отправьте повторно.</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {book.publication_state === 'pending' ? (
        <Alert>
          <AlertTitle>Произведение на проверке</AlertTitle>
          <AlertDescription>
            Пока заявка рассматривается, описание изменить нельзя. Главы можно писать и отправлять параллельно.
          </AlertDescription>
        </Alert>
      ) : null}
      {book.publication_state === 'hidden' ? (
        <Alert variant="destructive">
          <AlertTitle>Произведение скрыто модератором</AlertTitle>
          <AlertDescription>{book.rejection_reason || 'Обратитесь к модераторам за подробностями.'}</AlertDescription>
        </Alert>
      ) : null}
      {book.publication_state === 'draft' ? (
        <Alert>
          <AlertTitle>Как опубликовать</AlertTitle>
          <AlertDescription>
            Заполните описание (от 20 символов), выберите жанры, добавьте главы и отправьте произведение и главы на
            проверку. После одобрения книга появится в каталоге.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-white/5 bg-card p-5 sm:p-6" aria-labelledby="info-heading">
        <h2 id="info-heading" className="mb-5 text-lg font-semibold">
          Информация о произведении
        </h2>
        {editable ? (
          <BookForm
            key={book.updated_at}
            initial={formInitial}
            initialCoverUrl={book.coverUrl}
            submitLabel="Сохранить черновик"
            onSubmit={async (values) => {
              await updateDraftBook(book.id, values)
              toast.success('Изменения сохранены')
              invalidate()
            }}
          />
        ) : book.publication_state === 'published' ? (
          <PublishedBookInfo book={book} onStatusChange={(value) => status.mutate(value)} statusPending={status.isPending} />
        ) : (
          <BookSummary book={book} />
        )}
      </section>

      <ChaptersSection bookId={book.id} disabled={book.publication_state === 'hidden'} />
    </PageContainer>
  )
}

function BookSummary({ book }: { book: StudioBookDetail }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <BookCover title={book.title} url={book.coverUrl} className="w-32 shrink-0" />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {book.genres.map((g) => (
            <GenreChip key={g.id} name={g.name} />
          ))}
        </div>
        <p className="text-sm whitespace-pre-line text-foreground/85">{book.description || 'Описание не заполнено.'}</p>
      </div>
    </div>
  )
}

function PublishedBookInfo({
  book,
  onStatusChange,
  statusPending,
}: {
  book: StudioBookDetail
  onStatusChange: (status: WorkStatus) => void
  statusPending: boolean
}) {
  const invalidate = useInvalidateStudio(book.id)
  const revision = book.openRevision
  const revisionQueue = book.pendingQueue.find((q) => q.kind === 'book_revision')

  const start = useMutation({
    mutationFn: () => startBookRevision(book.id),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const submit = useMutation({
    mutationFn: (id: string) => submitBookRevision(id),
    onSuccess: () => {
      toast.success('Изменения отправлены на проверку')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const discard = useMutation({
    mutationFn: (id: string) => discardBookRevision(id),
    onSuccess: () => {
      toast.success('Правка удалена')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => cancelSubmission(id),
    onSuccess: () => {
      toast.success('Заявка отозвана')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="published-status">Статус выпуска</Label>
          <Select value={book.status} onValueChange={(value) => onStatusChange(value as WorkStatus)} disabled={statusPending}>
            <SelectTrigger id="published-status" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {WORK_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="pb-2 text-xs text-muted-foreground">Меняется сразу, без модерации.</p>
      </div>

      {!revision ? (
        <>
          <BookSummary book={book} />
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-4">
            <p className="flex-1 text-sm text-muted-foreground">
              Название, описание, обложка и жанры опубликованной книги меняются через правку: читатели видят текущую
              версию, пока модератор не одобрит новую.
            </p>
            <Button variant="secondary" onClick={() => start.mutate()} disabled={start.isPending}>
              <PencilLine /> Предложить изменения
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {revision.state === 'rejected' && revision.rejection_reason ? (
            <Alert variant="destructive">
              <AlertTitle>Правка отклонена</AlertTitle>
              <AlertDescription>{revision.rejection_reason}</AlertDescription>
            </Alert>
          ) : null}
          {revision.state === 'pending' ? (
            <Alert>
              <AlertTitle>Правка на проверке</AlertTitle>
              <AlertDescription>Читатели видят прежнюю версию до одобрения.</AlertDescription>
            </Alert>
          ) : null}
          <BookForm
            key={revision.updated_at}
            hideStatus
            disabled={revision.state === 'pending'}
            initial={{
              title: revision.title,
              description: revision.description,
              status: book.status,
              is_adult: revision.is_adult,
              cover_path: revision.cover_path,
              genre_ids: revision.genre_ids,
            }}
            initialCoverUrl={revision.coverUrl}
            submitLabel="Сохранить правку"
            onSubmit={async (values) => {
              await updateBookRevision(revision.id, values)
              toast.success('Правка сохранена')
              invalidate()
            }}
            footer={
              revision.state === 'pending' ? (
                revisionQueue ? (
                  <Button type="button" variant="secondary" onClick={() => cancel.mutate(revisionQueue.id)}>
                    <Undo2 /> Отозвать
                  </Button>
                ) : null
              ) : (
                <>
                  <ConfirmDialog
                    title="Удалить правку?"
                    description="Несохранённые и неотправленные изменения пропадут."
                    confirmLabel="Удалить"
                    destructive
                    onConfirm={() => discard.mutate(revision.id)}
                    trigger={
                      <Button type="button" variant="ghost">
                        <Trash2 /> Удалить правку
                      </Button>
                    }
                  />
                  <Button type="button" variant="secondary" onClick={() => submit.mutate(revision.id)} disabled={submit.isPending}>
                    <Send /> Отправить на проверку
                  </Button>
                </>
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            Сначала сохраните правку, затем отправьте её на проверку.
          </p>
        </div>
      )}
    </div>
  )
}

function ChaptersSection({ bookId, disabled }: { bookId: string; disabled: boolean }) {
  const chapters = useStudioChapters(bookId)
  const stats = useChapterStats(bookId)
  const nextNumber = chapters.data?.length ? Math.floor(Math.max(...chapters.data.map((c) => Number(c.number)))) + 1 : 1

  return (
    <section className="space-y-4" aria-labelledby="chapters-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chapters-heading" className="text-lg font-semibold">
          Главы
        </h2>
        {disabled ? null : <NewChapterDialog bookId={bookId} suggestedNumber={nextNumber} />}
      </div>

      {chapters.error ? (
        <ErrorState error={chapters.error} onRetry={() => void chapters.refetch()} compact />
      ) : chapters.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : chapters.data.length === 0 ? (
        <EmptyState icon={FilePlus2} title="Глав пока нет" description="Добавьте первую главу." compact />
      ) : (
        <ul className="space-y-2">
          {chapters.data.map((chapter) => {
            const open = chapter.openRevision
            const title = open?.title || chapter.published_title || 'Без названия'
            const chapterStats = chapter.published_revision_id ? stats.data?.get(chapter.id) : undefined
            return (
              <li key={chapter.id}>
                <Link
                  to={`/studio/books/${bookId}/chapters/${chapter.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-white/5 bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
                >
                  <span className="w-14 shrink-0 text-sm text-muted-foreground tabular-nums">
                    № {formatChapterNumber(chapter.number)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCount(open?.word_count ?? chapter.word_count, WORD_FORMS)} · изменено{' '}
                      {formatRelative(open?.updated_at ?? chapter.updated_at)}
                    </p>
                    {chapterStats ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1" title="Сколько читателей дочитали главу">
                          <Eye className="size-3.5" aria-hidden /> {formatCount(chapterStats.reads, READ_FORMS)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3.5" aria-hidden /> {formatCount(chapterStats.likes, LIKE_FORMS)}
                        </span>
                      </p>
                    ) : null}
                    {open?.state === 'rejected' && open.rejection_reason ? (
                      <p className="mt-1 line-clamp-2 text-xs text-red-300">Причина: {open.rejection_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {chapter.published_revision_id ? <PublicationBadge state="published" /> : null}
                    {open ? (
                      <PublicationBadge
                        state={open.state}
                        kind="revision"
                        className={chapter.published_revision_id ? 'opacity-90' : undefined}
                      />
                    ) : null}
                    {open && chapter.published_revision_id ? (
                      <span className="text-xs text-muted-foreground self-center">новая версия</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function NewChapterDialog({ bookId, suggestedNumber }: { bookId: string; suggestedNumber: number }) {
  const navigate = useNavigate()
  const invalidate = useInvalidateStudio(bookId)
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [title, setTitle] = useState('')

  const create = useMutation({
    mutationFn: () => {
      const parsed = number.trim() ? Number(number.replace(',', '.')) : null
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) throw new Error('Некорректный номер главы')
      return createChapter(bookId, parsed, title)
    },
    onSuccess: (chapter) => {
      invalidate()
      setOpen(false)
      navigate(`/studio/books/${bookId}/chapters/${chapter.id}`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) {
          setNumber(String(suggestedNumber))
          setTitle('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <FilePlus2 /> Добавить главу
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Новая глава</DialogTitle>
            <DialogDescription>Номер можно указать дробным, например 10,5 для экстры.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
            <div className="space-y-2">
              <Label htmlFor="chapter-number">Номер</Label>
              <Input id="chapter-number" inputMode="decimal" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter-title">Название</Label>
              <Input id="chapter-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : null} Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
