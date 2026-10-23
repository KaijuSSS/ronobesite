import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, CalendarDays, PenSquare, Settings, Users, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BookCard, BookGrid, BookGridSkeleton } from '@/components/books/BookCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageContainer } from '@/components/layout/AppLayout'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { useAuth } from '@/features/auth/hooks'
import { useBooksByAuthor } from '@/features/books/hooks'
import { fetchProfileByUsername } from '@/features/profile/api'
import { FollowButton, FollowersCount } from '@/features/profile/FollowButton'
import { LibraryOverview } from '@/pages/LibraryPage'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { displayName, formatDate } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'

export default function ProfilePage() {
  const { username = '' } = useParams()
  const { userId } = useAuth()
  const profile = useQuery({
    queryKey: ['profile', username],
    queryFn: () => fetchProfileByUsername(username),
  })
  const books = useBooksByAuthor(profile.data?.id)
  useDocumentTitle(profile.data ? displayName(profile.data) : 'Профиль')

  if (profile.error) {
    return (
      <PageContainer>
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </PageContainer>
    )
  }
  if (profile.isPending) {
    return (
      <PageContainer className="space-y-8">
        <div className="flex items-center gap-5">
          <Skeleton className="size-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <BookGridSkeleton count={6} />
      </PageContainer>
    )
  }
  if (!profile.data) {
    return (
      <PageContainer>
        <EmptyState
          icon={UserX}
          title="Пользователь не найден"
          description="Проверьте адрес профиля."
          action={
            <Button asChild variant="secondary">
              <Link to="/">На главную</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  const p = profile.data
  const isOwn = p.id === userId
  const staffRoles = p.roles.filter((r) => r !== 'reader')

  return (
    <PageContainer className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-card p-6 sm:p-8">
        <div aria-hidden className="bg-brand-gradient absolute inset-x-0 top-0 h-24 opacity-30 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar profile={p} className="size-24 text-xl ring-4 ring-background" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight">{displayName(p)}</h1>
              {staffRoles.map((role) => (
                <span key={role} className="rounded-md bg-primary/20 px-2 py-0.5 text-xs font-medium text-violet-200">
                  {ROLE_LABELS[role]}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">@{p.username}</p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden /> На сайте с {formatDate(p.created_at)}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden /> <FollowersCount authorId={p.id} />
              </span>
            </p>
            {p.bio ? <p className="max-w-2xl pt-1 text-sm whitespace-pre-line text-foreground/85">{p.bio}</p> : null}
          </div>
          {isOwn ? (
            <div className="flex gap-2">
              <Button asChild variant="secondary">
                <Link to="/settings">
                  <Settings /> Редактировать
                </Link>
              </Button>
            </div>
          ) : (
            <FollowButton authorId={p.id} className="self-start sm:self-center" />
          )}
        </div>
      </section>

      <section aria-labelledby="works-heading" className="space-y-4">
        <h2 id="works-heading" className="flex items-center gap-2 text-lg font-semibold">
          <PenSquare className="size-5 text-primary" aria-hidden /> Произведения
        </h2>
        {books.error ? (
          <ErrorState error={books.error} onRetry={() => void books.refetch()} compact />
        ) : books.isPending ? (
          <BookGridSkeleton count={6} />
        ) : books.data.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Пока нет опубликованных произведений"
            compact
            action={
              isOwn ? (
                <Button asChild>
                  <Link to="/studio/new">Создать произведение</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <BookGrid>
            {books.data.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </BookGrid>
        )}
      </section>

      {isOwn ? (
        <section aria-labelledby="own-library-heading" className="space-y-4">
          <h2 id="own-library-heading" className="text-lg font-semibold">
            Моя библиотека <span className="text-sm font-normal text-muted-foreground">(видна только вам)</span>
          </h2>
          <LibraryOverview />
        </section>
      ) : null}
    </PageContainer>
  )
}
