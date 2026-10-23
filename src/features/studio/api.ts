import { getSupabase } from '@/lib/supabase'
import { unwrap, unwrapList, unwrapOne } from '@/lib/errors'
import { signMediaPath, withCoverUrls } from '@/lib/media'
import type {
  BookRevisionRow,
  BookRow,
  ChapterRevisionRow,
  ChapterRow,
  ChapterStatsRow,
  GenreRow,
  Json,
  ModerationQueueRow,
  WorkStatus,
} from '@/types/database'

type GenreInfo = Pick<GenreRow, 'id' | 'slug' | 'name'>
export type StudioBook = BookRow & { genres: GenreInfo[]; coverUrl: string | null }

const OPEN_STATES = ['draft', 'pending', 'rejected'] as const

export async function fetchMyBooks(userId: string): Promise<StudioBook[]> {
  const { data, error } = await getSupabase()
    .from('books')
    .select('*, genres(id, slug, name)')
    .eq('author_id', userId)
    .order('updated_at', { ascending: false })
    .overrideTypes<Array<BookRow & { genres: GenreInfo[] }>, { merge: false }>()
  if (error) throw error
  return withCoverUrls(data ?? [])
}

export type StudioBookDetail = StudioBook & {
  openRevision: (BookRevisionRow & { coverUrl: string | null }) | null
  pendingQueue: Pick<ModerationQueueRow, 'id' | 'kind' | 'created_at'>[]
}

export async function fetchStudioBook(bookId: string): Promise<StudioBookDetail | null> {
  const supabase = getSupabase()
  const { data: book, error } = await supabase
    .from('books')
    .select('*, genres(id, slug, name)')
    .eq('id', bookId)
    .maybeSingle()
    .overrideTypes<(BookRow & { genres: GenreInfo[] }) | null, { merge: false }>()
  if (error) throw error
  if (!book) return null

  const [revision, queue] = await Promise.all([
    supabase.from('book_revisions').select('*').eq('book_id', bookId).in('state', [...OPEN_STATES]).maybeSingle(),
    supabase
      .from('moderation_queue')
      .select('id, kind, created_at')
      .eq('book_id', bookId)
      .eq('status', 'pending')
      .in('kind', ['book', 'book_revision']),
  ])
  const openRevision = unwrap(revision)
  const [coverUrl, revisionCoverUrl] = await Promise.all([
    signMediaPath(book.cover_path),
    signMediaPath(openRevision?.cover_path),
  ])

  return {
    ...book,
    coverUrl,
    openRevision: openRevision ? { ...openRevision, coverUrl: revisionCoverUrl } : null,
    pendingQueue: unwrapList(queue),
  }
}

export type BookFormValues = {
  title: string
  description: string
  status: WorkStatus
  is_adult: boolean
  cover_path: string | null
  genre_ids: string[]
}

export async function createBook(values: BookFormValues): Promise<BookRow> {
  const supabase = getSupabase()
  const book = unwrapOne(
    await supabase
      .from('books')
      .insert({
        title: values.title.trim(),
        description: values.description.trim(),
        status: values.status,
        is_adult: values.is_adult,
        cover_path: values.cover_path,
      })
      .select('*')
      .single(),
  )
  unwrap(await supabase.rpc('set_book_genres', { _book_id: book.id, _genre_ids: values.genre_ids }))
  return book
}

/** Редактирование черновика (или отклонённого) произведения напрямую. */
export async function updateDraftBook(bookId: string, values: BookFormValues): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('books')
    .update({
      title: values.title.trim(),
      description: values.description.trim(),
      is_adult: values.is_adult,
      cover_path: values.cover_path,
    })
    .eq('id', bookId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Произведение уже отправлено на проверку — изменения недоступны')
  unwrap(await supabase.rpc('set_book_genres', { _book_id: bookId, _genre_ids: values.genre_ids }))
  unwrap(await supabase.rpc('set_book_status', { _book_id: bookId, _status: values.status }))
}

export async function setBookStatus(bookId: string, status: WorkStatus): Promise<void> {
  unwrap(await getSupabase().rpc('set_book_status', { _book_id: bookId, _status: status }))
}

export async function deleteBook(bookId: string): Promise<void> {
  const { data, error } = await getSupabase().from('books').delete().eq('id', bookId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Удалить можно только неопубликованный черновик')
}

export async function submitBook(bookId: string): Promise<void> {
  unwrap(await getSupabase().rpc('submit_book', { _book_id: bookId }))
}

export async function startBookRevision(bookId: string): Promise<BookRevisionRow> {
  return unwrapOne(await getSupabase().rpc('start_book_revision', { _book_id: bookId }))
}

export async function updateBookRevision(revisionId: string, values: BookFormValues): Promise<void> {
  const { data, error } = await getSupabase()
    .from('book_revisions')
    .update({
      title: values.title.trim(),
      description: values.description.trim(),
      is_adult: values.is_adult,
      cover_path: values.cover_path,
      genre_ids: values.genre_ids,
    })
    .eq('id', revisionId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Правка уже отправлена на проверку — изменения недоступны')
}

export async function submitBookRevision(revisionId: string): Promise<void> {
  unwrap(await getSupabase().rpc('submit_book_revision', { _revision_id: revisionId }))
}

export async function discardBookRevision(revisionId: string): Promise<void> {
  unwrap(await getSupabase().from('book_revisions').delete().eq('id', revisionId))
}

export async function cancelSubmission(queueId: string): Promise<void> {
  unwrap(await getSupabase().rpc('cancel_submission', { _queue_id: queueId }))
}

// ---------------------------------------------------------------------
// Главы
// ---------------------------------------------------------------------

type RevisionSummary = Pick<
  ChapterRevisionRow,
  'id' | 'title' | 'state' | 'word_count' | 'rejection_reason' | 'updated_at' | 'submitted_at'
>

export type StudioChapter = ChapterRow & {
  openRevision: RevisionSummary | null
}

export async function fetchStudioChapters(bookId: string): Promise<StudioChapter[]> {
  const { data, error } = await getSupabase()
    .from('chapters')
    .select(
      '*, revisions:chapter_revisions!chapter_revisions_chapter_id_fkey(id, title, state, word_count, rejection_reason, updated_at, submitted_at)',
    )
    .eq('book_id', bookId)
    .order('number', { ascending: true })
    .overrideTypes<Array<ChapterRow & { revisions: RevisionSummary[] }>, { merge: false }>()
  if (error) throw error
  return (data ?? []).map(({ revisions, ...chapter }) => ({
    ...chapter,
    openRevision: revisions.find((r) => (OPEN_STATES as readonly string[]).includes(r.state)) ?? null,
  }))
}

/** Лайки и прочтения глав (видны только автору и модераторам). */
export async function fetchChapterStats(bookId: string): Promise<Map<string, ChapterStatsRow>> {
  const rows = unwrapList(await getSupabase().rpc('book_chapter_stats', { _book_id: bookId }))
  return new Map(rows.map((row) => [row.chapter_id, row]))
}

export async function createChapter(bookId: string, number: number | null, title: string): Promise<ChapterRow> {
  return unwrapOne(await getSupabase().rpc('create_chapter', { _book_id: bookId, _number: number, _title: title }))
}

export type ChapterEditorData = {
  chapter: ChapterRow
  openRevision: ChapterRevisionRow | null
  publishedRevision: ChapterRevisionRow | null
  pendingQueueId: string | null
}

export async function fetchChapterEditor(chapterId: string): Promise<ChapterEditorData | null> {
  const supabase = getSupabase()
  const chapter = unwrap(await supabase.from('chapters').select('*').eq('id', chapterId).maybeSingle())
  if (!chapter) return null

  const revisions = unwrapList(
    await supabase
      .from('chapter_revisions')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: false }),
  )
  const openRevision = revisions.find((r) => (OPEN_STATES as readonly string[]).includes(r.state)) ?? null
  const publishedRevision = revisions.find((r) => r.id === chapter.published_revision_id) ?? null

  let pendingQueueId: string | null = null
  if (openRevision?.state === 'pending') {
    const queue = unwrap(
      await supabase
        .from('moderation_queue')
        .select('id')
        .eq('chapter_revision_id', openRevision.id)
        .eq('status', 'pending')
        .maybeSingle(),
    )
    pendingQueueId = queue?.id ?? null
  }

  return { chapter, openRevision, publishedRevision, pendingQueueId }
}

export async function startChapterRevision(chapterId: string): Promise<ChapterRevisionRow> {
  return unwrapOne(await getSupabase().rpc('start_chapter_revision', { _chapter_id: chapterId }))
}

/** Максимальный размер текста главы (совпадает с ограничением в базе). */
export const MAX_CHAPTER_BYTES = 600_000

export async function saveChapterRevision(revisionId: string, title: string, content: Json): Promise<string> {
  const size = new TextEncoder().encode(JSON.stringify(content)).length
  if (size > MAX_CHAPTER_BYTES) {
    throw new Error('Глава слишком большая. Разделите её на несколько частей.')
  }
  const { data, error } = await getSupabase()
    .from('chapter_revisions')
    .update({ title: title.trim().slice(0, 200), content })
    .eq('id', revisionId)
    .select('updated_at')
  if (error) throw error
  if (!data?.length) throw new Error('Версия уже отправлена на проверку — изменения не сохранены')
  return data[0].updated_at
}

export async function submitChapterRevision(revisionId: string): Promise<void> {
  unwrap(await getSupabase().rpc('submit_chapter_revision', { _revision_id: revisionId }))
}

export async function discardChapterRevision(revisionId: string): Promise<void> {
  unwrap(await getSupabase().from('chapter_revisions').delete().eq('id', revisionId))
}

export async function updateChapterNumber(chapterId: string, number: number): Promise<void> {
  const { data, error } = await getSupabase().from('chapters').update({ number }).eq('id', chapterId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Не удалось изменить номер главы')
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const { data, error } = await getSupabase().from('chapters').delete().eq('id', chapterId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Удалить можно только неопубликованную главу')
}

// ---------------------------------------------------------------------
// Заявки автора
// ---------------------------------------------------------------------

export type MySubmission = ModerationQueueRow & {
  book: Pick<BookRow, 'id' | 'title' | 'slug'> | null
  chapter: Pick<ChapterRow, 'id' | 'number'> | null
}

export async function fetchMySubmissions(userId: string): Promise<MySubmission[]> {
  const { data, error } = await getSupabase()
    .from('moderation_queue')
    .select('*, book:books(id, title, slug), chapter:chapters(id, number)')
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false })
    .limit(100)
    .overrideTypes<MySubmission[], { merge: false }>()
  if (error) throw error
  return data ?? []
}
