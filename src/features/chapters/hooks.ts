import { useQuery } from '@tanstack/react-query'
import { fetchChapterForReading, fetchPublishedChapters } from './api'

export const chapterKeys = {
  list: (bookId: string) => ['chapters', 'list', bookId] as const,
  reading: (chapterId: string) => ['chapters', 'reading', chapterId] as const,
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
