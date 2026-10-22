import { Star } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { formatRating } from '@/lib/format'
import { PUBLICATION_STATE_LABELS, REVISION_STATE_LABELS, WORK_STATUS_LABELS } from '@/lib/labels'
import type { PublicationState, RevisionState, WorkStatus } from '@/types/database'

const STATUS_STYLES: Record<WorkStatus, string> = {
  ongoing: 'bg-sky-500/15 text-sky-300',
  completed: 'bg-emerald-500/15 text-emerald-300',
  hiatus: 'bg-amber-500/15 text-amber-300',
  abandoned: 'bg-zinc-500/20 text-zinc-300',
}

export function WorkStatusBadge({ status, className }: { status: WorkStatus; className?: string }) {
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status], className)}>
      {WORK_STATUS_LABELS[status]}
    </span>
  )
}

const STATE_STYLES: Record<PublicationState | RevisionState, string> = {
  draft: 'bg-zinc-500/20 text-zinc-300',
  pending: 'bg-amber-500/15 text-amber-300',
  published: 'bg-emerald-500/15 text-emerald-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-red-500/15 text-red-300',
  hidden: 'bg-red-500/15 text-red-300',
  superseded: 'bg-zinc-500/20 text-zinc-400',
}

export function PublicationBadge({
  state,
  kind = 'book',
  className,
}: {
  state: PublicationState | RevisionState
  kind?: 'book' | 'revision'
  className?: string
}) {
  const label =
    kind === 'book'
      ? PUBLICATION_STATE_LABELS[state as PublicationState]
      : REVISION_STATE_LABELS[state as RevisionState]
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', STATE_STYLES[state], className)}>
      {label}
    </span>
  )
}

export function RatingBadge({ value, count, className }: { value: number; count: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-sm font-semibold tabular-nums', className)}
      title={count ? `Средняя оценка ${formatRating(value, count)} из 10` : 'Оценок пока нет'}
    >
      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      {formatRating(value, count)}
    </span>
  )
}

export function GenreChip({ name, slug, className }: { name: string; slug?: string; className?: string }) {
  const classes = cn(
    'inline-flex rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
    slug && 'hover:bg-primary/20 hover:text-foreground',
    className,
  )
  if (!slug) return <span className={classes}>{name}</span>
  return (
    <Link to={`/catalog?genres=${slug}`} className={classes}>
      {name}
    </Link>
  )
}
