import { getSupabase } from '@/lib/supabase'
import { unwrap, unwrapList, unwrapOne } from '@/lib/errors'
import type { ChapterLikeInfo, ChapterRevisionRow, ChapterRow } from '@/types/database'

export type ChapterListItem = Pick<ChapterRow, 'id' | 'number' | 'published_title' | 'word_count' | 'published_at'>

/** Опубликованные главы книги (RLS скрывает неопубликованные от читателей). */
export async function fetchPublishedChapters(bookId: string): Promise<ChapterListItem[]> {
  return unwrapList(
    await getSupabase()
      .from('chapters')
      .select('id, number, published_title, word_count, published_at')
      .eq('book_id', bookId)
      .not('published_revision_id', 'is', null)
      .order('number', { ascending: true }),
  )
}

export type ChapterForReading = ChapterRow & {
  revision: Pick<ChapterRevisionRow, 'id' | 'title' | 'content' | 'word_count'> | null
}

export async function fetchChapterForReading(chapterId: string): Promise<ChapterForReading | null> {
  const { data, error } = await getSupabase()
    .from('chapters')
    .select('*, revision:chapter_revisions!chapters_published_revision_fk(id, title, content, word_count)')
    .eq('id', chapterId)
    .not('published_revision_id', 'is', null)
    .maybeSingle()
    .overrideTypes<ChapterForReading | null, { merge: false }>()
  if (error) throw error
  return data
}

export async function fetchChapterLikes(chapterId: string): Promise<ChapterLikeInfo> {
  return unwrapOne(await getSupabase().rpc('chapter_like_info', { _chapter_id: chapterId })) as ChapterLikeInfo
}

export async function toggleChapterLike(chapterId: string): Promise<ChapterLikeInfo> {
  return unwrapOne(await getSupabase().rpc('toggle_chapter_like', { _chapter_id: chapterId })) as ChapterLikeInfo
}

/** Отмечает главу дочитанной (для статистики автора). Повторные вызовы ничего не меняют. */
export async function markChapterRead(chapterId: string): Promise<void> {
  unwrap(await getSupabase().rpc('mark_chapter_read', { _chapter_id: chapterId }))
}
