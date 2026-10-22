import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Flag, MessageSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { useAuth } from '@/features/auth/hooks'
import { getErrorMessage } from '@/lib/errors'
import { displayName, formatRelative } from '@/lib/format'
import { addComment, deleteComment, fetchComments, type CommentScope } from './api'
import { ReportDialog } from './ReportDialog'

const MAX_LENGTH = 3000

export function CommentsSection({ scope, title = 'Комментарии' }: { scope: CommentScope; title?: string }) {
  const { isAuthenticated, userId, isStaff } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['comments', scope.bookId, scope.chapterId ?? 'book']
  const comments = useQuery({ queryKey, queryFn: () => fetchComments(scope) })
  const [body, setBody] = useState('')

  const add = useMutation({
    mutationFn: () => addComment(scope, body),
    onSuccess: () => {
      setBody('')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: deleteComment,
    onSuccess: () => {
      toast.success('Комментарий удалён')
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (body.trim()) add.mutate()
  }

  return (
    <section aria-labelledby="comments-heading" className="space-y-5">
      <h2 id="comments-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MessageSquare className="size-5 text-primary" aria-hidden />
        {title}
        {comments.data ? <span className="text-sm font-normal text-muted-foreground">{comments.data.length}</span> : null}
      </h2>

      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <label htmlFor={`comment-${scope.chapterId ?? scope.bookId}`} className="sr-only">
            Текст комментария
          </label>
          <Textarea
            id={`comment-${scope.chapterId ?? scope.bookId}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Поделитесь впечатлениями…"
            maxLength={MAX_LENGTH}
            rows={3}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {body.length}/{MAX_LENGTH}
            </span>
            <Button type="submit" disabled={!body.trim() || add.isPending}>
              {add.isPending ? 'Отправка…' : 'Отправить'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Войдите
          </Link>
          , чтобы оставить комментарий.
        </p>
      )}

      {comments.error ? (
        <ErrorState error={comments.error} onRetry={() => void comments.refetch()} compact />
      ) : comments.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.data.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Пока нет комментариев" description="Станьте первым!" compact />
      ) : (
        <ul className="space-y-5">
          {comments.data.map((comment) => {
            const own = comment.user_id === userId
            return (
              <li key={comment.id} className="flex gap-3">
                <UserAvatar profile={comment.user} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {comment.user ? (
                      <Link to={`/profile/${comment.user.username}`} className="text-sm font-semibold hover:text-primary">
                        {displayName(comment.user)}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold">Удалённый пользователь</span>
                    )}
                    <time dateTime={comment.created_at} className="text-xs text-muted-foreground">
                      {formatRelative(comment.created_at)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm break-words whitespace-pre-line text-foreground/90">{comment.body}</p>
                  {isAuthenticated ? (
                    <div className="mt-1 flex gap-1">
                      {own || isStaff ? (
                        <ConfirmDialog
                          title="Удалить комментарий?"
                          description="Это действие нельзя отменить."
                          confirmLabel="Удалить"
                          destructive
                          onConfirm={() => remove.mutate(comment.id)}
                          trigger={
                            <Button variant="ghost" size="xs" className="text-muted-foreground">
                              <Trash2 /> Удалить
                            </Button>
                          }
                        />
                      ) : null}
                      {!own ? (
                        <ReportDialog
                          targetType="comment"
                          targetId={comment.id}
                          trigger={
                            <Button variant="ghost" size="xs" className="text-muted-foreground">
                              <Flag /> Пожаловаться
                            </Button>
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
