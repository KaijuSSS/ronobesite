import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Cloud,
  Eye,
  FileQuestion,
  Loader2,
  PencilLine,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PublicationBadge } from '@/components/books/BookBadges'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageLoader } from '@/components/common/PageLoader'
import { PageContainer } from '@/components/layout/AppLayout'
import { RichText } from '@/features/reader/RichText'
import { countWords } from '@/features/reader/rich-text-utils'
import {
  cancelSubmission,
  deleteChapter,
  discardChapterRevision,
  saveChapterRevision,
  startChapterRevision,
  submitChapterRevision,
  updateChapterNumber,
  type ChapterEditorData,
} from '@/features/studio/api'
import { ChapterEditor } from '@/features/studio/ChapterEditor'
import { studioKeys, useChapterEditorData } from '@/features/studio/hooks'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorMessage } from '@/lib/errors'
import { formatChapterNumber, formatCount, formatRelative } from '@/lib/format'
import { WORD_FORMS } from '@/lib/labels'
import type { ChapterRevisionRow, Json } from '@/types/database'

const AUTOSAVE_DELAY_MS = 1500

export default function ChapterEditorPage() {
  const { bookId = '', chapterId } = useParams()
  const data = useChapterEditorData(chapterId)
  useDocumentTitle('Редактор главы')

  if (data.error) {
    return (
      <PageContainer>
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      </PageContainer>
    )
  }
  if (data.isPending) return <PageLoader label="Загрузка главы…" />
  if (!data.data || data.data.chapter.book_id !== bookId) {
    return (
      <PageContainer>
        <EmptyState
          icon={FileQuestion}
          title="Глава не найдена"
          action={
            <Button asChild variant="secondary">
              <Link to={`/studio/books/${bookId}`}>К произведению</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  return <ChapterEditorView bookId={bookId} data={data.data} />
}

function ChapterEditorView({ bookId, data }: { bookId: string; data: ChapterEditorData }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { chapter, openRevision, publishedRevision, pendingQueueId } = data

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: studioKeys.all })
  }, [queryClient])

  const start = useMutation({
    mutationFn: () => startChapterRevision(chapter.id),
    onSuccess: invalidate,
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => deleteChapter(chapter.id),
    onSuccess: () => {
      toast.success('Глава удалена')
      invalidate()
      navigate(`/studio/books/${bookId}`, { replace: true })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <PageContainer className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={`/studio/books/${bookId}`}>
            <ArrowLeft /> К произведению
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Глава {formatChapterNumber(chapter.number)}
            </h1>
            {chapter.published_revision_id ? <PublicationBadge state="published" /> : null}
            {openRevision ? <PublicationBadge state={openRevision.state} kind="revision" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChapterNumberEditor chapterId={chapter.id} number={chapter.number} onSaved={invalidate} />
            {!chapter.published_revision_id ? (
              <ConfirmDialog
                title="Удалить главу?"
                description="Глава ещё не опубликована и будет удалена полностью."
                confirmLabel="Удалить"
                destructive
                onConfirm={() => remove.mutate()}
                trigger={
                  <Button variant="ghost" size="icon" aria-label="Удалить главу">
                    <Trash2 />
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </div>

      {openRevision ? (
        <RevisionEditor
          key={openRevision.id}
          revision={openRevision}
          hasPublished={Boolean(publishedRevision)}
          pendingQueueId={pendingQueueId}
          onChanged={invalidate}
        />
      ) : publishedRevision ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Опубликованная версия</AlertTitle>
            <AlertDescription>
              <p>
                Чтобы исправить главу, создайте правку. Читатели будут видеть текущий текст, пока модератор не одобрит
                новую версию.
              </p>
              <Button className="mt-3" onClick={() => start.mutate()} disabled={start.isPending}>
                {start.isPending ? <Loader2 className="animate-spin" /> : <PencilLine />} Создать правку
              </Button>
            </AlertDescription>
          </Alert>
          <article className="rounded-2xl border border-white/5 bg-card px-4 py-6 sm:px-8">
            <h2 className="mb-6 text-center font-display text-xl font-semibold">{publishedRevision.title}</h2>
            <RichText content={publishedRevision.content} className="reader-prose font-serif text-[18px] leading-[1.75]" />
          </article>
        </div>
      ) : (
        <EmptyState
          icon={PencilLine}
          title="Нет текста для редактирования"
          action={
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              Начать писать
            </Button>
          }
        />
      )}
    </PageContainer>
  )
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

function RevisionEditor({
  revision,
  hasPublished,
  pendingQueueId,
  onChanged,
}: {
  revision: ChapterRevisionRow
  hasPublished: boolean
  pendingQueueId: string | null
  onChanged: () => void
}) {
  const editable = revision.state === 'draft' || revision.state === 'rejected'
  const [title, setTitle] = useState(revision.title)
  const [content, setContent] = useState<Json>(revision.content)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [savedAt, setSavedAt] = useState(revision.updated_at)
  const [saveError, setSaveError] = useState<string | null>(null)
  const latest = useRef({ title, content })
  const inFlight = useRef<Promise<void> | null>(null)

  const persist = useCallback(async () => {
    const snapshot = latest.current
    setSaveState('saving')
    try {
      const updatedAt = await saveChapterRevision(revision.id, snapshot.title, snapshot.content)
      setSavedAt(updatedAt)
      setSaveError(null)
      // Если за время запроса текст изменился — останемся в состоянии «есть изменения».
      setSaveState(latest.current === snapshot ? 'saved' : 'dirty')
    } catch (error) {
      setSaveError(getErrorMessage(error))
      setSaveState('error')
      throw error
    }
  }, [revision.id])

  const autosave = useDebouncedCallback(() => {
    inFlight.current = persist().catch(() => undefined)
  }, AUTOSAVE_DELAY_MS)

  function change(next: { title?: string; content?: Json }) {
    latest.current = { ...latest.current, ...next }
    if (next.title !== undefined) setTitle(next.title)
    if (next.content !== undefined) setContent(next.content)
    setSaveState('dirty')
    autosave.run()
  }

  /** Немедленно сохранить всё несохранённое. */
  async function saveNow() {
    autosave.cancel()
    await inFlight.current
    if (saveState !== 'saved') await persist()
  }

  // Предупреждение при закрытии вкладки с несохранёнными изменениями.
  useEffect(() => {
    if (saveState === 'saved') return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveState])

  // Сохраняем при уходе со страницы внутри приложения.
  useEffect(() => () => autosave.flush(), [autosave])

  const submit = useMutation({
    mutationFn: async () => {
      await saveNow()
      await submitChapterRevision(revision.id)
    },
    onSuccess: () => {
      toast.success('Глава отправлена на проверку')
      onChanged()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const cancel = useMutation({
    mutationFn: () => cancelSubmission(pendingQueueId as string),
    onSuccess: () => {
      toast.success('Заявка отозвана — можно редактировать')
      onChanged()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const discard = useMutation({
    mutationFn: () => discardChapterRevision(revision.id),
    onSuccess: () => {
      toast.success('Правка удалена')
      onChanged()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const words = countWords(content)

  return (
    <div className="space-y-4">
      {revision.state === 'rejected' && revision.rejection_reason ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Модератор отклонил эту версию</AlertTitle>
          <AlertDescription>
            <p>{revision.rejection_reason}</p>
            <p className="mt-1">Исправьте текст и отправьте повторно.</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {revision.state === 'pending' ? (
        <Alert>
          <AlertTitle>Версия на проверке</AlertTitle>
          <AlertDescription>
            Редактирование недоступно, пока модератор рассматривает заявку.
            {hasPublished ? ' Читатели видят предыдущую опубликованную версию.' : ''}
          </AlertDescription>
        </Alert>
      ) : null}
      {hasPublished && editable ? (
        <Alert>
          <AlertTitle>Правка опубликованной главы</AlertTitle>
          <AlertDescription>Читатели видят прежний текст до одобрения этой версии.</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky top-16 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b border-white/5 bg-background/90 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-3">
        <SaveIndicator state={saveState} savedAt={savedAt} error={saveError} />
        <span className="text-xs text-muted-foreground tabular-nums">{formatCount(words, WORD_FORMS)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {editable && saveState !== 'saved' ? (
            <Button size="sm" variant="ghost" onClick={() => void saveNow().catch(() => undefined)}>
              Сохранить
            </Button>
          ) : null}
          {editable && hasPublished ? (
            <ConfirmDialog
              title="Отменить правку?"
              description="Изменения в этой версии будут удалены. Опубликованный текст останется без изменений."
              confirmLabel="Удалить правку"
              destructive
              onConfirm={() => discard.mutate()}
              trigger={
                <Button size="sm" variant="ghost">
                  <Trash2 /> Отменить правку
                </Button>
              }
            />
          ) : null}
          {revision.state === 'pending' && pendingQueueId ? (
            <Button size="sm" variant="secondary" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              <Undo2 /> Отозвать заявку
            </Button>
          ) : null}
          {editable ? (
            <Button
              size="sm"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || saveState === 'saving'}
              className="bg-brand-gradient border-0 text-white"
            >
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {revision.state === 'rejected' ? 'Отправить повторно' : 'На проверку'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="chapter-title-input">Название главы</Label>
        <Input
          id="chapter-title-input"
          value={title}
          maxLength={200}
          disabled={!editable}
          onChange={(e) => change({ title: e.target.value })}
          placeholder="Например: Пробуждение"
          className="h-11 text-base"
        />
      </div>

      <Tabs defaultValue="edit" className="gap-4">
        <TabsList>
          <TabsTrigger value="edit">
            <PencilLine /> Текст
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye /> Предпросмотр
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edit" forceMount className="data-[state=inactive]:hidden">
          <ChapterEditor content={revision.content} editable={editable} onChange={(next) => change({ content: next })} />
        </TabsContent>
        <TabsContent value="preview">
          <article className="rounded-2xl border border-white/5 bg-card px-4 py-8 sm:px-10">
            <h2 className="mb-8 text-center font-display text-2xl font-semibold">{title || 'Без названия'}</h2>
            <RichText content={content} className="reader-prose mx-auto max-w-[680px] font-serif text-[18px] leading-[1.75]" />
          </article>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SaveIndicator({ state, savedAt, error }: { state: SaveState; savedAt: string; error: string | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
      {state === 'saving' ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Сохранение…
        </>
      ) : state === 'dirty' ? (
        <>
          <Cloud className="size-3.5" aria-hidden /> Есть несохранённые изменения
        </>
      ) : state === 'error' ? (
        <span className="flex items-center gap-1.5 text-red-300">
          <AlertCircle className="size-3.5" aria-hidden /> {error ?? 'Ошибка сохранения'}
        </span>
      ) : (
        <>
          <Check className="size-3.5 text-emerald-400" aria-hidden /> Сохранено {formatRelative(savedAt)}
        </>
      )}
    </span>
  )
}

function ChapterNumberEditor({ chapterId, number, onSaved }: { chapterId: string; number: number; onSaved: () => void }) {
  const [value, setValue] = useState(formatChapterNumber(number))
  const save = useMutation({
    mutationFn: () => {
      const parsed = Number(value.replace(',', '.'))
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Некорректный номер главы')
      return updateChapterNumber(chapterId, parsed)
    },
    onSuccess: () => {
      toast.success('Номер главы изменён')
      onSaved()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const changed = value.replace(',', '.') !== String(Number(number))

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) save.mutate()
      }}
    >
      <Label htmlFor="chapter-number-edit" className="text-xs text-muted-foreground">
        Номер
      </Label>
      <Input
        id="chapter-number-edit"
        value={value}
        inputMode="decimal"
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-20"
      />
      {changed ? (
        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          OK
        </Button>
      ) : null}
    </form>
  )
}
