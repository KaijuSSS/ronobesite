import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import type { ReportStatus } from '@/types/database'
import {
  approveSubmission,
  fetchModerationHistory,
  fetchPendingCounts,
  fetchQueue,
  fetchQueueItem,
  fetchReports,
  rejectSubmission,
  resolveReport,
  setBookHidden,
  type QueueFilter,
} from './api'

export const moderationKeys = {
  all: ['moderation'] as const,
  queue: (filter: QueueFilter) => ['moderation', 'queue', filter] as const,
  counts: ['moderation', 'counts'] as const,
  item: (id: string) => ['moderation', 'item', id] as const,
  history: ['moderation', 'history'] as const,
  reports: (status: string) => ['moderation', 'reports', status] as const,
}

export function useModerationQueue(filter: QueueFilter) {
  return useQuery({ queryKey: moderationKeys.queue(filter), queryFn: () => fetchQueue(filter) })
}

export function usePendingCounts() {
  return useQuery({ queryKey: moderationKeys.counts, queryFn: fetchPendingCounts, refetchInterval: 60_000 })
}

export function useQueueItem(id: string | undefined) {
  return useQuery({
    queryKey: moderationKeys.item(id ?? ''),
    queryFn: () => fetchQueueItem(id as string),
    enabled: Boolean(id),
  })
}

export function useModerationHistory() {
  return useQuery({ queryKey: moderationKeys.history, queryFn: () => fetchModerationHistory() })
}

export function useReports(status: ReportStatus | 'all') {
  return useQuery({ queryKey: moderationKeys.reports(status), queryFn: () => fetchReports(status) })
}

export function useModerationActions() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: moderationKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    void queryClient.invalidateQueries({ queryKey: ['chapters'] })
  }
  const onError = (error: unknown) => {
    toast.error(getErrorMessage(error))
    invalidate()
  }

  return {
    approve: useMutation({
      mutationFn: ({ id, note }: { id: string; note: string }) => approveSubmission(id, note),
      onSuccess: () => {
        toast.success('Заявка одобрена и опубликована')
        invalidate()
      },
      onError,
    }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectSubmission(id, reason),
      onSuccess: () => {
        toast.success('Заявка отклонена, автор получит уведомление')
        invalidate()
      },
      onError,
    }),
    resolveReport: useMutation({
      mutationFn: ({ id, status, note }: { id: string; status: Exclude<ReportStatus, 'open'>; note: string }) =>
        resolveReport(id, status, note),
      onSuccess: () => {
        toast.success('Жалоба обработана')
        invalidate()
      },
      onError,
    }),
    setHidden: useMutation({
      mutationFn: ({ bookId, hidden, reason }: { bookId: string; hidden: boolean; reason: string }) =>
        setBookHidden(bookId, hidden, reason),
      onSuccess: (_d, vars) => {
        toast.success(vars.hidden ? 'Произведение скрыто' : 'Произведение снова доступно')
        invalidate()
      },
      onError,
    }),
  }
}
