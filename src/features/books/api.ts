import { getSupabase } from '@/lib/supabase'
import { unwrapList } from '@/lib/errors'
import { signMediaPath, withCoverUrls } from '@/lib/media'
import type { BookRow, GenreRow, ProfileRow, WorkStatus } from '@/types/database'

export type AuthorInfo = Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_path'>
export type GenreInfo = Pick<GenreRow, 'id' | 'slug' | 'name'>

export type BookSummary = BookRow & {
  author: AuthorInfo | null
  genres: GenreInfo[]
  coverUrl: string | null
}

export type BookSort = 'updated' | 'new' | 'popular' | 'rating'

export const BOOK_SORT_LABELS: Record<BookSort, string> = {
  updated: 'По обновлениям',
  new: 'По новизне',
  popular: 'По популярности',
  rating: 'По рейтингу',
}

export type BookListParams = {
  query?: string
  genreIds?: string[]
  statuses?: WorkStatus[]
  sort?: BookSort
  page?: number
  pageSize?: number
}

export type BookListResult = {
  items: BookSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Связь указана явно: books и profiles связаны ещё через library_entries
// и reading_progress, и без подсказки PostgREST отвечает ошибкой PGRST201.
const BOOK_SELECT =
  '*, author:profiles!books_author_id_fkey(id, username, display_name, avatar_path), genres(id, slug, name)'

type BookWithRelations = BookRow & { author: AuthorInfo | null; genres: GenreInfo[] }

export async function listBooks(params: BookListParams = {}): Promise<BookListResult> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = params.pageSize ?? 24
  const from = (page - 1) * pageSize

  let request = getSupabase()
    .rpc(
      'filter_books',
      {
        _query: params.query?.trim() || null,
        _genre_ids: params.genreIds?.length ? params.genreIds : null,
        _statuses: params.statuses?.length ? params.statuses : null,
      },
      { count: 'exact' },
    )
    .select(BOOK_SELECT)

  switch (params.sort ?? 'updated') {
    case 'new':
      request = request.order('published_at', { ascending: false, nullsFirst: false })
      break
    case 'popular':
      request = request.order('library_count', { ascending: false }).order('rating_count', { ascending: false })
      break
    case 'rating':
      request = request.order('rating_avg', { ascending: false }).order('rating_count', { ascending: false })
      break
    default:
      request = request.order('last_chapter_at', { ascending: false, nullsFirst: false })
  }

  const { data, error, count } = await request
    .order('id')
    .range(from, from + pageSize - 1)
    .overrideTypes<BookWithRelations[], { merge: false }>()
  if (error) throw error

  const total = count ?? 0
  return {
    items: await withCoverUrls(data ?? []),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function fetchGenres(): Promise<GenreRow[]> {
  return unwrapList(await getSupabase().from('genres').select('*').order('sort_order'))
}

export type BookDetail = BookSummary

export async function fetchBookBySlug(slug: string): Promise<BookDetail | null> {
  const { data, error } = await getSupabase()
    .from('books')
    .select(BOOK_SELECT)
    .eq('slug', slug)
    .maybeSingle()
    .overrideTypes<BookWithRelations | null, { merge: false }>()
  if (error) throw error
  if (!data) return null
  return { ...data, coverUrl: await signMediaPath(data.cover_path) }
}

export async function fetchBooksByAuthor(authorId: string): Promise<BookSummary[]> {
  const { data, error } = await getSupabase()
    .from('books')
    .select(BOOK_SELECT)
    .eq('author_id', authorId)
    .eq('publication_state', 'published')
    .order('published_at', { ascending: false })
    .overrideTypes<BookWithRelations[], { merge: false }>()
  if (error) throw error
  return withCoverUrls(data ?? [])
}
