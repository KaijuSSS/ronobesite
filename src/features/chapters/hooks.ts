import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import { fetchChapterForReading, fetchChapterLikes, fetchPublishedChapters, toggleChapterLike } from './api'

export const chapterKeys = {
  list: (bookId: string) => ['chapters', 'list', bookId] as const,
  reading: (chapterId: string) => ['chapters', 'reading', chapterId] as const,
  likes: (chapterId: string) => ['chapters', 'likes', chapterId] as const,
}

export function usePublishedChapters(bookId: string | undefined) {
  return useQuery({
    queryKey: chapterKeys.list(bookId ?? ''),
    queryFn: () => fetchPublishedChapters(bookId as string),
    enabled: Boolean(bookId),
    staleTime: 60 * 1000,
  })
}

export function useChapterForReading(chapterId: string | undefined) {
  return useQuery({
    queryKey: chapterKeys.reading(chapterId ?? ''),
    queryFn: () => fetchChapterForReading(chapterId as string),
    enabled: Boolean(chapterId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useChapterLikes(chapterId: string | undefined) {
  return useQuery({
    queryKey: chapterKeys.likes(chapterId ?? ''),
    queryFn: () => fetchChapterLikes(chapterId as string),
    enabled: Boolean(chapterId),
  })
}

export function useToggleChapterLike(chapterId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => toggleChapterLike(chapterId),
    onSuccess: (info) => queryClient.setQueryData(chapterKeys.likes(chapterId), info),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
