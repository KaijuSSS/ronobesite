import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks'
import { fetchChapterEditor, fetchMyBooks, fetchMySubmissions, fetchStudioBook, fetchStudioChapters } from './api'

export const studioKeys = {
  all: ['studio'] as const,
  books: (userId: string) => ['studio', 'books', userId] as const,
  book: (bookId: string) => ['studio', 'book', bookId] as const,
  chapters: (bookId: string) => ['studio', 'chapters', bookId] as const,
  chapter: (chapterId: string) => ['studio', 'chapter', chapterId] as const,
  submissions: (userId: string) => ['studio', 'submissions', userId] as const,
}

export function useMyBooks() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: studioKeys.books(userId ?? ''),
    queryFn: () => fetchMyBooks(userId as string),
    enabled: Boolean(userId),
  })
}

export function useStudioBook(bookId: string | undefined) {
  return useQuery({
    queryKey: studioKeys.book(bookId ?? ''),
    queryFn: () => fetchStudioBook(bookId as string),
    enabled: Boolean(bookId),
  })
}

export function useStudioChapters(bookId: string | undefined) {
  return useQuery({
    queryKey: studioKeys.chapters(bookId ?? ''),
    queryFn: () => fetchStudioChapters(bookId as string),
    enabled: Boolean(bookId),
  })
}

export function useChapterEditorData(chapterId: string | undefined) {
  return useQuery({
    queryKey: studioKeys.chapter(chapterId ?? ''),
    queryFn: () => fetchChapterEditor(chapterId as string),
    enabled: Boolean(chapterId),
    // Не перезагружаем текст при возврате на вкладку, чтобы не сбить редактор.
    refetchOnWindowFocus: false,
  })
}

export function useMySubmissions() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: studioKeys.submissions(userId ?? ''),
    queryFn: () => fetchMySubmissions(userId as string),
    enabled: Boolean(userId),
  })
}
