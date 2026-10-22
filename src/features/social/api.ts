import { getSupabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import type { CommentRow, ProfileRow, ReportTarget, ReviewRow } from '@/types/database'

type PublicProfile = Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_path'>

export type ReviewWithUser = ReviewRow & { user: PublicProfile | null }
export type CommentWithUser = CommentRow & { user: PublicProfile | null }

const USER_SELECT = 'user:profiles(id, username, display_name, avatar_path)'

export async function fetchReviews(bookId: string): Promise<ReviewWithUser[]> {
  const { data, error } = await getSupabase()
    .from('reviews')
    .select(`*, ${USER_SELECT}`)
    .eq('book_id', bookId)
    .order('created_at', { ascending: false })
    .limit(100)
    .overrideTypes<ReviewWithUser[], { merge: false }>()
  if (error) throw error
  return data ?? []
}

export async function saveReview(bookId: string, rating: number, body: string): Promise<void> {
  unwrap(
    await getSupabase()
      .from('reviews')
      .upsert({ book_id: bookId, rating, body: body.trim() }, { onConflict: 'book_id,user_id' }),
  )
}

export async function deleteReview(id: string): Promise<void> {
  unwrap(await getSupabase().from('reviews').delete().eq('id', id))
}

export type CommentScope = { bookId: string; chapterId: string | null }

export async function fetchComments({ bookId, chapterId }: CommentScope): Promise<CommentWithUser[]> {
  let request = getSupabase().from('comments').select(`*, ${USER_SELECT}`).eq('book_id', bookId)
  request = chapterId ? request.eq('chapter_id', chapterId) : request.is('chapter_id', null)
  const { data, error } = await request
    .order('created_at', { ascending: false })
    .limit(200)
    .overrideTypes<CommentWithUser[], { merge: false }>()
  if (error) throw error
  return data ?? []
}

export async function addComment(scope: CommentScope, body: string, parentId: string | null = null): Promise<void> {
  unwrap(
    await getSupabase().from('comments').insert({
      book_id: scope.bookId,
      chapter_id: scope.chapterId,
      parent_id: parentId,
      body: body.trim(),
    }),
  )
}

export async function deleteComment(id: string): Promise<void> {
  const { data, error } = await getSupabase().from('comments').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Не удалось удалить комментарий: недостаточно прав')
}

export async function createReport(targetType: ReportTarget, targetId: string, reason: string): Promise<void> {
  unwrap(
    await getSupabase().from('reports').insert({ target_type: targetType, target_id: targetId, reason: reason.trim() }),
  )
}
