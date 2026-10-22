import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { getErrorMessage } from '@/lib/errors'
import { LIBRARY_STATUS_LABELS } from '@/lib/labels'
import type { LibraryStatus } from '@/types/database'
import {
  fetchLibrary,
  fetchLibraryEntry,
  fetchProgress,
  fetchReadingHistory,
  removeFromLibrary,
  removeProgress,
  setLibraryStatus,
} from './api'

export const libraryKeys = {
  all: ['library'] as const,
  list: ['library', 'list'] as const,
  entry: (bookId: string) => ['library', 'entry', bookId] as const,
  history: ['library', 'history'] as const,
  progress: (bookId: string) => ['library', 'progress', bookId] as const,
}

export function useLibraryEntry(bookId: string | undefined) {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: libraryKeys.entry(bookId ?? ''),
    queryFn: () => fetchLibraryEntry(bookId as string),
    enabled: Boolean(bookId) && isAuthenticated,
  })
}

export function useLibrary() {
  return useQuery({ queryKey: libraryKeys.list, queryFn: fetchLibrary })
}

export function useReadingHistory() {
  return useQuery({ queryKey: libraryKeys.history, queryFn: () => fetchReadingHistory() })
}

export function useBookProgress(bookId: string | undefined) {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: libraryKeys.progress(bookId ?? ''),
    queryFn: () => fetchProgress(bookId as string),
    enabled: Boolean(bookId) && isAuthenticated,
  })
}

export function useLibraryMutations(bookId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: libraryKeys.all })

  const setStatus = useMutation({
    mutationFn: (status: LibraryStatus) => setLibraryStatus(bookId, status),
    onSuccess: (_data, status) => {
      toast.success(`Добавлено в «${LIBRARY_STATUS_LABELS[status]}»`)
      void invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => removeFromLibrary(bookId),
    onSuccess: () => {
      toast.success('Убрано из библиотеки')
      void invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const clearProgress = useMutation({
    mutationFn: () => removeProgress(bookId),
    onSuccess: () => void invalidate(),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return { setStatus, remove, clearProgress }
}
