import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchBookBySlug, fetchBooksByAuthor, fetchGenres, listBooks, type BookListParams } from './api'

export const bookKeys = {
  all: ['books'] as const,
  list: (params: BookListParams) => ['books', 'list', params] as const,
  detail: (slug: string) => ['books', 'detail', slug] as const,
  byAuthor: (authorId: string) => ['books', 'author', authorId] as const,
  genres: ['genres'] as const,
}

export function useBookList(params: BookListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: bookKeys.list(params),
    queryFn: () => listBooks(params),
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    enabled: options.enabled ?? true,
  })
}

export function useGenres() {
  return useQuery({ queryKey: bookKeys.genres, queryFn: fetchGenres, staleTime: 60 * 60 * 1000 })
}

export function useBook(slug: string | undefined) {
  return useQuery({
    queryKey: bookKeys.detail(slug ?? ''),
    queryFn: () => fetchBookBySlug(slug as string),
    enabled: Boolean(slug),
    staleTime: 60 * 1000,
  })
}

export function useBooksByAuthor(authorId: string | undefined) {
  return useQuery({
    queryKey: bookKeys.byAuthor(authorId ?? ''),
    queryFn: () => fetchBooksByAuthor(authorId as string),
    enabled: Boolean(authorId),
  })
}
