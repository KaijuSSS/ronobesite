import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { useAuth } from '@/features/auth/hooks'
import { bookKeys } from '@/features/books/hooks'
import { getErrorMessage } from '@/lib/errors'
import { displayName, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { deleteReview, fetchReviews, saveReview } from './api'

type ReviewsSectionProps = {
  bookId: string
  bookSlug: string
  authorId: string
}

export function ReviewsSection({ bookId, bookSlug, authorId }: ReviewsSectionProps) {
  const { isAuthenticated, userId, isStaff } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['reviews', bookId]
  const reviews = useQuery({ queryKey, queryFn: () => fetchReviews(bookId) })
  const own = reviews.data?.find((r) => r.user_id === userId)
  const isAuthor = userId === authorId

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey })
    void queryClient.invalidateQueries({ queryKey: bookKeys.detail(bookSlug) })
  }

  const remove = useMutation({
    mutationFn: deleteReview,
    onSuccess: () => {
      toast.success('Отзыв удалён')
      invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <section aria-labelledby="reviews-heading" className="space-y-5">
      <h2 id="reviews-heading" className="flex items-center gap-2 text-lg font-semibold">
        <Star className="size-5 text-amber-400" aria-hidden /> Отзывы и оценки
      </h2>

      {!isAuthenticated ? (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Войдите
          </Link>
          , чтобы оценить произведение.
        </p>
      ) : isAuthor ? (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          Это ваше произведение — оценивать его могут только читатели.
        </p>
      ) : (
        <ReviewForm
          key={own ? `${own.id}:${own.updated_at}` : 'new'}
          bookId={bookId}
          initialRating={own?.rating ?? 0}
          initialBody={own?.body ?? ''}
          isEdit={Boolean(own)}
          onSaved={invalidate}
        />
      )}

      {reviews.error ? (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} compact />
      ) : reviews.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : reviews.data.length === 0 ? (
        <EmptyState icon={Star} title="Пока нет отзывов" description="Расскажите, что думаете о книге." compact />
      ) : (
        <ul className="space-y-3">
          {reviews.data.map((review) => (
            <li key={review.id} className="rounded-xl border border-white/5 bg-card p-4">
              <div className="flex items-center gap-3">
                <UserAvatar profile={review.user} className="size-8" />
                <div className="min-w-0 flex-1">
                  {review.user ? (
                    <Link to={`/profile/${review.user.username}`} className="text-sm font-semibold hover:text-primary">
                      {displayName(review.user)}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold">Удалённый пользователь</span>
                  )}
                  <p className="text-xs text-muted-foreground">{formatRelative(review.created_at)}</p>
                </div>
                <span className="flex items-center gap-1 rounded-lg bg-amber-400/10 px-2 py-1 text-sm font-bold text-amber-300 tabular-nums">
                  <Star className="size-3.5 fill-current" aria-hidden /> {review.rating}
                  <span className="sr-only"> из 10</span>
                </span>
              </div>
              {review.body ? (
                <p className="mt-3 text-sm break-words whitespace-pre-line text-foreground/90">{review.body}</p>
              ) : null}
              {review.user_id === userId || isStaff ? (
                <div className="mt-2 flex justify-end">
                  <ConfirmDialog
                    title="Удалить отзыв?"
                    confirmLabel="Удалить"
                    destructive
                    onConfirm={() => remove.mutate(review.id)}
                    trigger={
                      <Button variant="ghost" size="xs" className="text-muted-foreground">
                        <Trash2 /> Удалить
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type ReviewFormProps = {
  bookId: string
  initialRating: number
  initialBody: string
  isEdit: boolean
  onSaved: () => void
}

function ReviewForm({ bookId, initialRating, initialBody, isEdit, onSaved }: ReviewFormProps) {
  const [rating, setRating] = useState(initialRating)
  const [body, setBody] = useState(initialBody)

  const save = useMutation({
    mutationFn: () => saveReview(bookId, rating, body),
    onSuccess: () => {
      toast.success(isEdit ? 'Отзыв обновлён' : 'Спасибо за оценку!')
      onSaved()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (rating > 0) save.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-white/5 bg-card p-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{isEdit ? 'Ваша оценка' : 'Оцените произведение'}</legend>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Оценка от 1 до 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} из 10`}
              onClick={() => setRating(value)}
              className={cn(
                'size-9 rounded-lg text-sm font-semibold tabular-nums transition-colors',
                value <= rating ? 'bg-amber-400 text-black' : 'bg-white/[0.06] text-muted-foreground hover:bg-white/10',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="review-body">Отзыв (необязательно)</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder="Что понравилось, а что нет?"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={rating === 0 || save.isPending}>
          {save.isPending ? 'Сохранение…' : isEdit ? 'Обновить отзыв' : 'Опубликовать'}
        </Button>
      </div>
    </form>
  )
}
