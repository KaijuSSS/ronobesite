import { getSupabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { withCoverUrls } from '@/lib/media'
import type { BookRow, ChapterRow, LibraryEntryRow, LibraryStatus, ReadingProgressRow } from '@/types/database'

type LibraryBook = Pick<
  BookRow,
  'id' | 'slug' | 'title' | 'cover_path' | 'chapters_count' | 'status' | 'last_chapter_at' | 'is_adult'
>

export type LibraryItem = LibraryEntryRow & {
  book: LibraryBook & { coverUrl: string | null }
  progress: Pick<ReadingProgressRow, 'chapter_id' | 'position' | 'updated_at'> | null
  progressChapter: Pick<ChapterRow, 'id' | 'number' | 'published_title'> | null
}

export type HistoryItem = ReadingProgressRow & {
  book: LibraryBook & { coverUrl: string | null }
  chapter: Pick<ChapterRow, 'id' | 'number' | 'published_title'> | null
}

const LIBRARY_BOOK_FIELDS = 'id, slug, title, cover_path, chapters_count, status, last_chapter_at, is_adult'

export async function fetchLibraryEntry(bookId: string): Promise<LibraryEntryRow | null> {
  return unwrap(await getSupabase().from('library_entries').select('*').eq('book_id', bookId).maybeSingle())
}

export async function setLibraryStatus(bookId: string, status: LibraryStatus): Promise<void> {
  unwrap(
    await getSupabase()
      .from('library_entries')
      .upsert({ book_id: bookId, status }, { onConflict: 'user_id,book_id' }),
  )
}

export async function removeFromLibrary(bookId: string): Promise<void> {
  unwrap(await getSupabase().from('library_entries').delete().eq('book_id', bookId))
}

type ProgressWithChapter = Pick<ReadingProgressRow, 'book_id' | 'chapter_id' | 'position' | 'updated_at'> & {
  chapter: Pick<ChapterRow, 'id' | 'number' | 'published_title'> | null
}

export async function fetchLibrary(): Promise<LibraryItem[]> {
  const supabase = getSupabase()
  const [entriesResult, progressResult] = await Promise.all([
    supabase
      .from('library_entries')
      .select(`*, book:books!inner(${LIBRARY_BOOK_FIELDS})`)
      .order('updated_at', { ascending: false })
      .overrideTypes<Array<LibraryEntryRow & { book: LibraryBook }>, { merge: false }>(),
    supabase
      .from('reading_progress')
      .select('book_id, chapter_id, position, updated_at, chapter:chapters(id, number, published_title)')
      .overrideTypes<ProgressWithChapter[], { merge: false }>(),
  ])
  if (entriesResult.error) throw entriesResult.error
  if (progressResult.error) throw progressResult.error

  const progressByBook = new Map((progressResult.data ?? []).map((p) => [p.book_id, p]))
  const books = await withCoverUrls((entriesResult.data ?? []).map((e) => e.book))

  return (entriesResult.data ?? []).map((entry, index) => {
    const progress = progressByBook.get(entry.book_id)
    return {
      ...entry,
      book: books[index],
      progress: progress
        ? { chapter_id: progress.chapter_id, position: progress.position, updated_at: progress.updated_at }
        : null,
      progressChapter: progress?.chapter ?? null,
    }
  })
}

export async function fetchReadingHistory(limit = 60): Promise<HistoryItem[]> {
  const { data, error } = await getSupabase()
    .from('reading_progress')
    .select(`*, book:books!inner(${LIBRARY_BOOK_FIELDS}), chapter:chapters(id, number, published_title)`)
    .order('updated_at', { ascending: false })
    .limit(limit)
    .overrideTypes<
      Array<ReadingProgressRow & { book: LibraryBook; chapter: HistoryItem['chapter'] }>,
      { merge: false }
    >()
  if (error) throw error
  const rows = data ?? []
  const books = await withCoverUrls(rows.map((r) => r.book))
  return rows.map((row, index) => ({ ...row, book: books[index] }))
}

export async function fetchProgress(bookId: string): Promise<ReadingProgressRow | null> {
  return unwrap(await getSupabase().from('reading_progress').select('*').eq('book_id', bookId).maybeSingle())
}

export async function saveProgress(bookId: string, chapterId: string, position: number): Promise<void> {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(position) ? position : 0))
  unwrap(
    await getSupabase()
      .from('reading_progress')
      .upsert({ book_id: bookId, chapter_id: chapterId, position: clamped }, { onConflict: 'user_id,book_id' }),
  )
}

export async function removeProgress(bookId: string): Promise<void> {
  unwrap(await getSupabase().from('reading_progress').delete().eq('book_id', bookId))
}
