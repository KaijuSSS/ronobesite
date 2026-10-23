import { getSupabase } from '@/lib/supabase'
import { unwrap, unwrapList } from '@/lib/errors'
import { signMediaPaths } from '@/lib/media'
import type {
  BookRevisionRow,
  BookRow,
  ChapterRevisionRow,
  ChapterRow,
  GenreRow,
  Json,
  ModerationEventRow,
  ModerationKind,
  ModerationQueueRow,
  ModerationStatus,
  ProfileRow,
  ReportRow,
  ReportStatus,
} from '@/types/database'

type ProfileInfo = Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_path'>
const PROFILE_FIELDS = 'id, username, display_name, avatar_path'

export type QueueListItem = ModerationQueueRow & {
  book: Pick<BookRow, 'id' | 'title' | 'slug' | 'publication_state'> | null
  chapter: Pick<ChapterRow, 'id' | 'number'> | null
  submitter: ProfileInfo | null
  reviewer: ProfileInfo | null
}

export type QueueFilter = {
  status: ModerationStatus | 'all'
  kind: ModerationKind | 'all'
}

const QUEUE_SELECT = `*,
  book:books(id, title, slug, publication_state),
  chapter:chapters(id, number),
  submitter:profiles!moderation_queue_submitted_by_fkey(${PROFILE_FIELDS}),
  reviewer:profiles!moderation_queue_reviewed_by_fkey(${PROFILE_FIELDS})`

export async function fetchQueue(filter: QueueFilter, limit = 100): Promise<QueueListItem[]> {
  let request = getSupabase().from('moderation_queue').select(QUEUE_SELECT)
  if (filter.status !== 'all') request = request.eq('status', filter.status)
  if (filter.kind !== 'all') request = request.eq('kind', filter.kind)
  // Ожидающие — сначала старые (очередь), остальные — сначала новые (история).
  const { data, error } = await request
    .order(filter.status === 'pending' ? 'created_at' : 'reviewed_at', {
      ascending: filter.status === 'pending',
      nullsFirst: false,
    })
    .order('created_at', { ascending: false })
    .limit(limit)
    .overrideTypes<QueueListItem[], { merge: false }>()
  if (error) throw error
  return data ?? []
}

export async function fetchPendingCounts(): Promise<Record<ModerationKind, number>> {
  const rows = unwrapList(await getSupabase().from('moderation_queue').select('kind').eq('status', 'pending'))
  const counts: Record<ModerationKind, number> = { book: 0, book_revision: 0, chapter_revision: 0 }
  for (const row of rows) counts[row.kind]++
  return counts
}

type GenreInfo = Pick<GenreRow, 'id' | 'slug' | 'name'>

export type QueueItemDetail = QueueListItem & {
  bookDetail: (BookRow & { genres: GenreInfo[]; coverUrl: string | null }) | null
  bookRevision: (BookRevisionRow & { coverUrl: string | null; genres: GenreInfo[] }) | null
  chapterRevision: ChapterRevisionRow | null
  publishedChapterRevision: ChapterRevisionRow | null
  events: Array<ModerationEventRow & { actor: ProfileInfo | null }>
}

export async function fetchQueueItem(queueId: string): Promise<QueueItemDetail | null> {
  const supabase = getSupabase()
  const { data: item, error } = await supabase
    .from('moderation_queue')
    .select(QUEUE_SELECT)
    .eq('id', queueId)
    .maybeSingle()
    .overrideTypes<QueueListItem | null, { merge: false }>()
  if (error) throw error
  if (!item) return null

  const [bookResult, eventsResult, genresResult] = await Promise.all([
    supabase
      .from('books')
      .select('*, genres(id, slug, name)')
      .eq('id', item.book_id)
      .maybeSingle()
      .overrideTypes<(BookRow & { genres: GenreInfo[] }) | null, { merge: false }>(),
    supabase
      .from('moderation_events')
      .select(`*, actor:profiles(${PROFILE_FIELDS})`)
      .eq('queue_id', queueId)
      .order('created_at')
      .overrideTypes<Array<ModerationEventRow & { actor: ProfileInfo | null }>, { merge: false }>(),
    supabase.from('genres').select('id, slug, name'),
  ])
  if (bookResult.error) throw bookResult.error
  if (eventsResult.error) throw eventsResult.error
  const allGenres = unwrapList(genresResult)

  let bookRevision: BookRevisionRow | null = null
  let chapterRevision: ChapterRevisionRow | null = null
  let publishedChapterRevision: ChapterRevisionRow | null = null

  if (item.book_revision_id) {
    bookRevision = unwrap(await supabase.from('book_revisions').select('*').eq('id', item.book_revision_id).maybeSingle())
  }
  if (item.chapter_revision_id && item.chapter_id) {
    chapterRevision = unwrap(
      await supabase.from('chapter_revisions').select('*').eq('id', item.chapter_revision_id).maybeSingle(),
    )
    const chapter = unwrap(
      await supabase.from('chapters').select('published_revision_id').eq('id', item.chapter_id).maybeSingle(),
    )
    if (chapter?.published_revision_id && chapter.published_revision_id !== item.chapter_revision_id) {
      publishedChapterRevision = unwrap(
        await supabase.from('chapter_revisions').select('*').eq('id', chapter.published_revision_id).maybeSingle(),
      )
    }
  }

  const book = bookResult.data
  const urls = await signMediaPaths([book?.cover_path, bookRevision?.cover_path])

  return {
    ...item,
    bookDetail: book ? { ...book, coverUrl: book.cover_path ? (urls.get(book.cover_path) ?? null) : null } : null,
    bookRevision: bookRevision
      ? {
          ...bookRevision,
          coverUrl: bookRevision.cover_path ? (urls.get(bookRevision.cover_path) ?? null) : null,
          genres: allGenres.filter((g) => bookRevision?.genre_ids.includes(g.id)),
        }
      : null,
    chapterRevision,
    publishedChapterRevision,
    events: eventsResult.data ?? [],
  }
}

export async function approveSubmission(queueId: string, note: string): Promise<void> {
  unwrap(await getSupabase().rpc('approve_submission', { _queue_id: queueId, _note: note.trim() || null }))
}

export async function rejectSubmission(queueId: string, reason: string): Promise<void> {
  unwrap(await getSupabase().rpc('reject_submission', { _queue_id: queueId, _reason: reason }))
}

/** Модератор исправляет опубликованную главу: новая версия публикуется сразу. */
export async function staffEditChapter(chapterId: string, title: string, content: Json, note: string): Promise<void> {
  unwrap(
    await getSupabase().rpc('staff_edit_chapter', {
      _chapter_id: chapterId,
      _title: title.trim(),
      _content: content,
      _note: note.trim() || null,
    }),
  )
}

export async function staffDeleteChapter(chapterId: string, reason: string): Promise<void> {
  unwrap(await getSupabase().rpc('staff_delete_chapter', { _chapter_id: chapterId, _reason: reason }))
}

export type HistoryEvent = ModerationEventRow & {
  actor: ProfileInfo | null
  queue: (Pick<ModerationQueueRow, 'id' | 'kind' | 'status'> & { book: Pick<BookRow, 'title'> | null }) | null
}

export async function fetchModerationHistory(limit = 100): Promise<HistoryEvent[]> {
  const { data, error } = await getSupabase()
    .from('moderation_events')
    .select(`*, actor:profiles(${PROFILE_FIELDS}), queue:moderation_queue(id, kind, status, book:books(title))`)
    .in('action', ['approved', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(limit)
    .overrideTypes<HistoryEvent[], { merge: false }>()
  if (error) throw error
  return data ?? []
}

export type ReportItem = ReportRow & { reporter: ProfileInfo | null }

export async function fetchReports(status: ReportStatus | 'all'): Promise<ReportItem[]> {
  let request = getSupabase()
    .from('reports')
    .select(`*, reporter:profiles!reports_reporter_id_fkey(${PROFILE_FIELDS})`)
  if (status !== 'all') request = request.eq('status', status)
  const { data, error } = await request
    .order('created_at', { ascending: false })
    .limit(100)
    .overrideTypes<ReportItem[], { merge: false }>()
  if (error) throw error
  return data ?? []
}

export async function resolveReport(reportId: string, status: Exclude<ReportStatus, 'open'>, note: string) {
  unwrap(await getSupabase().rpc('resolve_report', { _report_id: reportId, _status: status, _note: note.trim() || null }))
}

export async function setBookHidden(bookId: string, hidden: boolean, reason: string) {
  unwrap(await getSupabase().rpc('set_book_hidden', { _book_id: bookId, _hidden: hidden, _reason: reason.trim() || null }))
}

/** Ссылка на объект жалобы. */
export async function resolveReportTarget(report: ReportRow): Promise<string | null> {
  const supabase = getSupabase()
  switch (report.target_type) {
    case 'book': {
      const book = unwrap(await supabase.from('books').select('slug').eq('id', report.target_id).maybeSingle())
      return book ? `/book/${book.slug}` : null
    }
    case 'profile': {
      const p = unwrap(await supabase.from('profiles').select('username').eq('id', report.target_id).maybeSingle())
      return p ? `/profile/${p.username}` : null
    }
    case 'comment': {
      const c = unwrap(
        await supabase.from('comments').select('book_id, chapter_id').eq('id', report.target_id).maybeSingle(),
      )
      if (!c) return null
      const book = unwrap(await supabase.from('books').select('slug').eq('id', c.book_id).maybeSingle())
      if (!book) return null
      return c.chapter_id ? `/book/${book.slug}/chapter/${c.chapter_id}` : `/book/${book.slug}`
    }
    default:
      return null
  }
}
