import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileQuestion, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageLoader } from '@/components/common/PageLoader'
import { PageContainer } from '@/components/layout/AppLayout'
import { useBook } from '@/features/books/hooks'
import type { ChapterForReading } from '@/features/chapters/api'
import { chapterKeys, useChapterForReading } from '@/features/chapters/hooks'
import { staffEditChapter } from '@/features/moderation/api'
import { ChapterEditor } from '@/features/studio/ChapterEditor'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getErrorMessage } from '@/lib/errors'
import { formatChapterNumber } from '@/lib/format'
import type { Json } from '@/types/database'

/** Исправление опубликованной главы модератором (без повторной проверки). */
export default function StaffChapterEditPage() {
  const { slug, chapterId } = useParams()
  const book = useBook(slug)
  const chapter = useChapterForReading(chapterId)
  useDocumentTitle('Исправление главы')

  if (book.error || chapter.error) {
    return (
      <PageContainer>
        <ErrorState error={book.error ?? chapter.error} onRetry={() => void chapter.refetch()} />
      </PageContainer>
    )
  }
  if (book.isPending || chapter.isPending) return <PageLoader />
  if (!book.data || !chapter.data?.revision || chapter.data.book_id !== book.data.id) {
    return (
      <PageContainer>
        <EmptyState
          icon={FileQuestion}
          title="Глава не найдена"
          description="Исправлять можно только опубликованные главы."
          action={
            <Button asChild variant="secondary">
              <Link to="/moderation">К модерации</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  return <EditForm slug={book.data.slug} bookTitle={book.data.title} chapter={chapter.data} />
}

function EditForm({ slug, bookTitle, chapter }: { slug: string; bookTitle: string; chapter: ChapterForReading }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const readerUrl = `/book/${slug}/chapter/${chapter.id}`
  const [title, setTitle] = useState(chapter.revision?.title || chapter.published_title)
  const [content, setContent] = useState<Json>(chapter.revision?.content ?? { type: 'doc', content: [] })
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: () => staffEditChapter(chapter.id, title, content, note),
    onSuccess: () => {
      toast.success('Исправления опубликованы, автор получил уведомление')
      void queryClient.invalidateQueries({ queryKey: chapterKeys.reading(chapter.id) })
      void queryClient.invalidateQueries({ queryKey: chapterKeys.list(chapter.book_id) })
      void queryClient.invalidateQueries({ queryKey: ['studio'] })
      navigate(readerUrl)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <PageContainer className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link to={readerUrl} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> К главе
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">Исправление главы</h1>
        <p className="text-sm text-muted-foreground">
          {bookTitle} · Глава {formatChapterNumber(chapter.number)}
        </p>
      </div>

      <Alert>
        <AlertTitle>Изменения публикуются сразу</AlertTitle>
        <AlertDescription>
          Читатели увидят исправленный текст без повторной проверки. Автор получит уведомление, прежняя версия
          сохранится в истории.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="staff-title">Название главы</Label>
          <Input id="staff-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </div>

        <ChapterEditor content={content} editable onChange={setContent} />

        <div className="space-y-2">
          <Label htmlFor="staff-note">Что исправлено</Label>
          <Input
            id="staff-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Например: исправлены опечатки"
            aria-describedby="staff-note-hint"
          />
          <p id="staff-note-hint" className="text-xs text-muted-foreground">
            Необязательно. Автор увидит это в уведомлении.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="secondary">
            <Link to={readerUrl}>Отмена</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !title.trim()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Опубликовать исправления
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}
