import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, Flag, History, Inbox, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { PageContainer } from '@/components/layout/AppLayout'
import { UserAvatar } from '@/components/layout/UserAvatar'
import { resolveReportTarget, type QueueFilter, type ReportItem } from '@/features/moderation/api'
import {
  useModerationActions,
  useModerationHistory,
  useModerationQueue,
  usePendingCounts,
  useReports,
} from '@/features/moderation/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { displayName, formatChapterNumber, formatDateTime, formatRelative } from '@/lib/format'
import {
  MODERATION_KIND_LABELS,
  MODERATION_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
} from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { ModerationKind, ModerationStatus, ReportStatus } from '@/types/database'

const STATUS_STYLES: Record<ModerationStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-red-500/15 text-red-300',
  cancelled: 'bg-zinc-500/20 text-zinc-300',
}

export default function ModerationPage() {
  useDocumentTitle('Модерация')
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'queue'
  const counts = usePendingCounts()
  const totalPending = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : 0

  return (
    <PageContainer className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Модерация</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Проверка новых произведений, глав и изменений. Решение сразу применяется к публикации.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value })} className="gap-6">
        <TabsList>
          <TabsTrigger value="queue">
            <Inbox /> Заявки
            {totalPending > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{totalPending}</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> История
          </TabsTrigger>
          <TabsTrigger value="reports">
            <Flag /> Жалобы
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <QueueTab counts={counts.data} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

function QueueTab({ counts }: { counts: Record<ModerationKind, number> | undefined }) {
  const [filter, setFilter] = useState<QueueFilter>({ status: 'pending', kind: 'all' })
  const queue = useModerationQueue(filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={filter.status} onValueChange={(status) => setFilter((f) => ({ ...f, status: status as QueueFilter['status'] }))}>
          <SelectTrigger className="w-48" aria-label="Статус заявок">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Ожидают проверки</SelectItem>
            <SelectItem value="approved">Одобренные</SelectItem>
            <SelectItem value="rejected">Отклонённые</SelectItem>
            <SelectItem value="cancelled">Отозванные</SelectItem>
            <SelectItem value="all">Все</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.kind} onValueChange={(kind) => setFilter((f) => ({ ...f, kind: kind as QueueFilter['kind'] }))}>
          <SelectTrigger className="w-56" aria-label="Тип заявок">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {(Object.keys(MODERATION_KIND_LABELS) as ModerationKind[]).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {MODERATION_KIND_LABELS[kind]}
                {counts && counts[kind] > 0 ? ` (${counts[kind]})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {queue.error ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : queue.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : queue.data.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filter.status === 'pending' ? 'Очередь пуста' : 'Заявок не найдено'}
          description={filter.status === 'pending' ? 'Все заявки обработаны. Отличная работа!' : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {queue.data.map((item) => (
            <li key={item.id}>
              <Link
                to={`/moderation/${item.id}`}
                className="flex flex-col gap-3 rounded-xl border border-white/5 bg-card p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-primary">{MODERATION_KIND_LABELS[item.kind]}</p>
                  <p className="truncate font-semibold">
                    {item.book?.title ?? 'Произведение удалено'}
                    {item.chapter ? ` · глава ${formatChapterNumber(item.chapter.number)}` : ''}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserAvatar profile={item.submitter} className="size-4" />
                    {displayName(item.submitter)} · {formatRelative(item.created_at)}
                  </p>
                </div>
                <span className={cn('self-start rounded-md px-2 py-0.5 text-xs font-medium sm:self-center', STATUS_STYLES[item.status])}>
                  {MODERATION_STATUS_LABELS[item.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HistoryTab() {
  const history = useModerationHistory()
  if (history.error) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />
  if (history.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    )
  }
  if (history.data.length === 0) return <EmptyState icon={History} title="История пуста" />
  return (
    <ul className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-card">
      {history.data.map((event) => (
        <li key={event.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {event.action === 'approved' ? (
              <CheckCircle2 className="size-4 text-emerald-400" aria-hidden />
            ) : (
              <XCircle className="size-4 text-red-400" aria-hidden />
            )}
            {event.action === 'approved' ? 'Одобрено' : 'Отклонено'}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            {event.queue ? (
              <Link to={`/moderation/${event.queue.id}`} className="hover:text-primary">
                {MODERATION_KIND_LABELS[event.queue.kind]}: {event.queue.book?.title ?? '—'}
              </Link>
            ) : (
              '—'
            )}
            {event.reason ? <p className="truncate text-xs text-muted-foreground">«{event.reason}»</p> : null}
          </div>
          <span className="text-xs text-muted-foreground">
            {displayName(event.actor)} · {formatDateTime(event.created_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ReportsTab() {
  const [status, setStatus] = useState<ReportStatus | 'all'>('open')
  const reports = useReports(status)

  return (
    <div className="space-y-4">
      <Select value={status} onValueChange={(value) => setStatus(value as ReportStatus | 'all')}>
        <SelectTrigger className="w-48" aria-label="Статус жалоб">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open">Открытые</SelectItem>
          <SelectItem value="resolved">Решённые</SelectItem>
          <SelectItem value="dismissed">Отклонённые</SelectItem>
          <SelectItem value="all">Все</SelectItem>
        </SelectContent>
      </Select>
      {reports.error ? (
        <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
      ) : reports.isPending ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : reports.data.length === 0 ? (
        <EmptyState icon={Flag} title="Жалоб нет" />
      ) : (
        <ul className="space-y-2">
          {reports.data.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ReportCard({ report }: { report: ReportItem }) {
  const { resolveReport, setHidden } = useModerationActions()
  const [note, setNote] = useState('')
  const target = useQuery({
    queryKey: ['report-target', report.id],
    queryFn: () => resolveReportTarget(report),
  })

  return (
    <li className="space-y-3 rounded-xl border border-white/5 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-medium text-foreground">
          {REPORT_TARGET_LABELS[report.target_type]}
        </span>
        <span>
          от {displayName(report.reporter)} · {formatRelative(report.created_at)}
        </span>
        <span className="ml-auto">{REPORT_STATUS_LABELS[report.status]}</span>
      </div>
      <p className="text-sm whitespace-pre-line">{report.reason}</p>
      {target.data ? (
        <Button asChild variant="link" className="h-auto p-0">
          <Link to={target.data}>
            <ExternalLink /> Открыть объект жалобы
          </Link>
        </Button>
      ) : null}
      {report.status === 'open' ? (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Комментарий к решению (необязательно)"
            rows={2}
            aria-label="Комментарий к решению"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => resolveReport.mutate({ id: report.id, status: 'resolved', note })}>
              Решено
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => resolveReport.mutate({ id: report.id, status: 'dismissed', note })}
            >
              Отклонить жалобу
            </Button>
            {report.target_type === 'book' ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setHidden.mutate({ bookId: report.target_id, hidden: true, reason: note || report.reason })}
              >
                Скрыть произведение
              </Button>
            ) : null}
          </div>
        </div>
      ) : report.resolution_note ? (
        <p className="text-xs text-muted-foreground">Решение: {report.resolution_note}</p>
      ) : null}
    </li>
  )
}
