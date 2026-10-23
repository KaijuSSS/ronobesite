// Типы схемы базы данных для supabase-js.
// Повторяют структуру миграций из supabase/migrations. После подключения
// проекта их можно перегенерировать командой:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
// (сгенерированный файл совместим с этим по структуре).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'reader' | 'author' | 'moderator' | 'admin'
export type WorkStatus = 'ongoing' | 'completed' | 'hiatus' | 'abandoned'
export type PublicationState = 'draft' | 'pending' | 'published' | 'rejected' | 'hidden'
export type RevisionState = 'draft' | 'pending' | 'approved' | 'rejected' | 'superseded'
export type ModerationKind = 'book' | 'book_revision' | 'chapter_revision'
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type LibraryStatus = 'reading' | 'planned' | 'completed' | 'dropped'
export type ReportTarget = 'book' | 'chapter' | 'comment' | 'review' | 'profile'
export type ReportStatus = 'open' | 'resolved' | 'dismissed'

export type ProfileRow = {
  id: string
  username: string
  display_name: string | null
  bio: string
  avatar_path: string | null
  created_at: string
  updated_at: string
}

export type UserRoleRow = {
  user_id: string
  role: AppRole
  granted_by: string | null
  created_at: string
}

export type GenreRow = {
  id: string
  slug: string
  name: string
  sort_order: number
}

export type BookRow = {
  id: string
  slug: string
  author_id: string
  title: string
  description: string
  cover_path: string | null
  status: WorkStatus
  is_adult: boolean
  publication_state: PublicationState
  rejection_reason: string | null
  published_at: string | null
  last_chapter_at: string | null
  chapters_count: number
  rating_avg: number
  rating_count: number
  library_count: number
  created_at: string
  updated_at: string
}

export type BookGenreRow = {
  book_id: string
  genre_id: string
}

export type BookRevisionRow = {
  id: string
  book_id: string
  author_id: string
  title: string
  description: string
  cover_path: string | null
  is_adult: boolean
  genre_ids: string[]
  state: RevisionState
  rejection_reason: string | null
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type ChapterRow = {
  id: string
  book_id: string
  number: number
  published_revision_id: string | null
  published_title: string
  word_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ChapterRevisionRow = {
  id: string
  chapter_id: string
  author_id: string
  title: string
  content: Json
  word_count: number
  state: RevisionState
  rejection_reason: string | null
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type ModerationQueueRow = {
  id: string
  kind: ModerationKind
  book_id: string
  chapter_id: string | null
  book_revision_id: string | null
  chapter_revision_id: string | null
  submitted_by: string | null
  status: ModerationStatus
  decision_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export type ModerationEventRow = {
  id: string
  queue_id: string
  actor_id: string | null
  action: 'submitted' | 'approved' | 'rejected' | 'cancelled'
  reason: string | null
  created_at: string
}

export type LibraryEntryRow = {
  user_id: string
  book_id: string
  status: LibraryStatus
  created_at: string
  updated_at: string
}

export type ReadingProgressRow = {
  user_id: string
  book_id: string
  chapter_id: string | null
  position: number
  updated_at: string
}

export type ReviewRow = {
  id: string
  book_id: string
  user_id: string
  rating: number
  body: string
  created_at: string
  updated_at: string
}

export type CommentRow = {
  id: string
  book_id: string
  chapter_id: string | null
  user_id: string
  parent_id: string | null
  body: string
  created_at: string
  updated_at: string
}

export type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export type ReportRow = {
  id: string
  reporter_id: string | null
  target_type: ReportTarget
  target_id: string
  reason: string
  status: ReportStatus
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

export type InviteRow = {
  id: string
  code: string
  created_by: string | null
  email: string | null
  role: AppRole
  max_uses: number
  use_count: number
  expires_at: string | null
  revoked_at: string | null
  note: string | null
  created_at: string
}

export type InviteUseRow = {
  invite_id: string
  user_id: string
  used_at: string
}

export type AppSettingsRow = {
  id: boolean
  registration_mode: 'invite' | 'open'
  catalog_access: 'members' | 'public'
  max_pending_submissions: number
  updated_at: string
}

export type UserBanRow = {
  user_id: string
  reason: string
  banned_by: string | null
  created_at: string
}

export type MyBan = { reason: string; banned_at: string }

export type ChapterLikeInfo = { count: number; liked: boolean }
export type FollowInfo = { followers: number; following: boolean }
export type ChapterStatsRow = { chapter_id: string; likes: number; reads: number }

export type AdminUserRow = {
  id: string
  username: string
  display_name: string | null
  email: string
  roles: AppRole[]
  created_at: string
  last_sign_in_at: string | null
}

type Rel<Name extends string, Columns extends string, Ref extends string> = {
  foreignKeyName: Name
  columns: [Columns]
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: ['id']
}

type Table<R, I, U, Relationships extends unknown[] = []> = {
  Row: R
  Insert: I
  Update: U
  Relationships: Relationships
}

type NoFunctionArgs = Record<PropertyKey, never>

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13'
  }
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Pick<ProfileRow, 'id' | 'username'> & Partial<ProfileRow>,
        Partial<Pick<ProfileRow, 'username' | 'display_name' | 'bio' | 'avatar_path'>>
      >
      user_roles: Table<
        UserRoleRow,
        Pick<UserRoleRow, 'user_id' | 'role'> & Partial<UserRoleRow>,
        Partial<UserRoleRow>,
        [Rel<'user_roles_user_id_fkey', 'user_id', 'profiles'>]
      >
      genres: Table<GenreRow, Pick<GenreRow, 'slug' | 'name'> & Partial<GenreRow>, Partial<GenreRow>>
      books: Table<
        BookRow,
        Pick<BookRow, 'title'> & Partial<Pick<BookRow, 'description' | 'cover_path' | 'status' | 'is_adult'>>,
        Partial<Pick<BookRow, 'title' | 'description' | 'cover_path' | 'is_adult'>>,
        [Rel<'books_author_id_fkey', 'author_id', 'profiles'>]
      >
      book_genres: Table<
        BookGenreRow,
        BookGenreRow,
        Partial<BookGenreRow>,
        [
          Rel<'book_genres_book_id_fkey', 'book_id', 'books'>,
          Rel<'book_genres_genre_id_fkey', 'genre_id', 'genres'>,
        ]
      >
      book_revisions: Table<
        BookRevisionRow,
        Pick<BookRevisionRow, 'book_id' | 'author_id' | 'title'> & Partial<BookRevisionRow>,
        Partial<Pick<BookRevisionRow, 'title' | 'description' | 'cover_path' | 'is_adult' | 'genre_ids'>>,
        [
          Rel<'book_revisions_book_id_fkey', 'book_id', 'books'>,
          Rel<'book_revisions_author_id_fkey', 'author_id', 'profiles'>,
        ]
      >
      chapters: Table<
        ChapterRow,
        Pick<ChapterRow, 'book_id' | 'number'> & Partial<ChapterRow>,
        Partial<Pick<ChapterRow, 'number'>>,
        [
          Rel<'chapters_book_id_fkey', 'book_id', 'books'>,
          Rel<'chapters_published_revision_fk', 'published_revision_id', 'chapter_revisions'>,
        ]
      >
      chapter_revisions: Table<
        ChapterRevisionRow,
        Pick<ChapterRevisionRow, 'chapter_id' | 'author_id'> & Partial<ChapterRevisionRow>,
        Partial<Pick<ChapterRevisionRow, 'title' | 'content'>>,
        [
          Rel<'chapter_revisions_chapter_id_fkey', 'chapter_id', 'chapters'>,
          Rel<'chapter_revisions_author_id_fkey', 'author_id', 'profiles'>,
        ]
      >
      moderation_queue: Table<
        ModerationQueueRow,
        Pick<ModerationQueueRow, 'kind' | 'book_id'> & Partial<ModerationQueueRow>,
        Partial<ModerationQueueRow>,
        [
          Rel<'moderation_queue_book_id_fkey', 'book_id', 'books'>,
          Rel<'moderation_queue_chapter_id_fkey', 'chapter_id', 'chapters'>,
          Rel<'moderation_queue_book_revision_id_fkey', 'book_revision_id', 'book_revisions'>,
          Rel<'moderation_queue_chapter_revision_id_fkey', 'chapter_revision_id', 'chapter_revisions'>,
          Rel<'moderation_queue_submitted_by_fkey', 'submitted_by', 'profiles'>,
          Rel<'moderation_queue_reviewed_by_fkey', 'reviewed_by', 'profiles'>,
        ]
      >
      moderation_events: Table<
        ModerationEventRow,
        Pick<ModerationEventRow, 'queue_id' | 'action'> & Partial<ModerationEventRow>,
        Partial<ModerationEventRow>,
        [
          Rel<'moderation_events_queue_id_fkey', 'queue_id', 'moderation_queue'>,
          Rel<'moderation_events_actor_id_fkey', 'actor_id', 'profiles'>,
        ]
      >
      library_entries: Table<
        LibraryEntryRow,
        Pick<LibraryEntryRow, 'book_id'> & Partial<Pick<LibraryEntryRow, 'status'>>,
        Partial<Pick<LibraryEntryRow, 'book_id' | 'status'>>,
        [
          Rel<'library_entries_book_id_fkey', 'book_id', 'books'>,
          Rel<'library_entries_user_id_fkey', 'user_id', 'profiles'>,
        ]
      >
      reading_progress: Table<
        ReadingProgressRow,
        Pick<ReadingProgressRow, 'book_id'> & Partial<Pick<ReadingProgressRow, 'chapter_id' | 'position'>>,
        Partial<Pick<ReadingProgressRow, 'book_id' | 'chapter_id' | 'position'>>,
        [
          Rel<'reading_progress_book_id_fkey', 'book_id', 'books'>,
          Rel<'reading_progress_chapter_id_fkey', 'chapter_id', 'chapters'>,
          Rel<'reading_progress_user_id_fkey', 'user_id', 'profiles'>,
        ]
      >
      reviews: Table<
        ReviewRow,
        Pick<ReviewRow, 'book_id' | 'rating'> & Partial<Pick<ReviewRow, 'body'>>,
        Partial<Pick<ReviewRow, 'book_id' | 'rating' | 'body'>>,
        [
          Rel<'reviews_book_id_fkey', 'book_id', 'books'>,
          Rel<'reviews_user_id_fkey', 'user_id', 'profiles'>,
        ]
      >
      comments: Table<
        CommentRow,
        Pick<CommentRow, 'book_id' | 'body'> & Partial<Pick<CommentRow, 'chapter_id' | 'parent_id'>>,
        Partial<Pick<CommentRow, 'body'>>,
        [
          Rel<'comments_book_id_fkey', 'book_id', 'books'>,
          Rel<'comments_chapter_id_fkey', 'chapter_id', 'chapters'>,
          Rel<'comments_user_id_fkey', 'user_id', 'profiles'>,
          Rel<'comments_parent_id_fkey', 'parent_id', 'comments'>,
        ]
      >
      notifications: Table<
        NotificationRow,
        Pick<NotificationRow, 'user_id' | 'type' | 'title'> & Partial<NotificationRow>,
        Partial<Pick<NotificationRow, 'read_at'>>,
        [Rel<'notifications_user_id_fkey', 'user_id', 'profiles'>]
      >
      reports: Table<
        ReportRow,
        Pick<ReportRow, 'target_type' | 'target_id' | 'reason'>,
        Partial<ReportRow>,
        [Rel<'reports_reporter_id_fkey', 'reporter_id', 'profiles'>]
      >
      invites: Table<
        InviteRow,
        Pick<InviteRow, 'code'> & Partial<InviteRow>,
        Partial<InviteRow>,
        [Rel<'invites_created_by_fkey', 'created_by', 'profiles'>]
      >
      user_bans: Table<UserBanRow, never, never, [Rel<'user_bans_user_id_fkey', 'user_id', 'profiles'>]>
      invite_uses: Table<
        InviteUseRow,
        Pick<InviteUseRow, 'invite_id' | 'user_id'>,
        Partial<InviteUseRow>,
        [
          Rel<'invite_uses_invite_id_fkey', 'invite_id', 'invites'>,
          Rel<'invite_uses_user_id_fkey', 'user_id', 'profiles'>,
        ]
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      get_public_config: { Args: NoFunctionArgs; Returns: Json }
      check_signup: { Args: { _invite_code: string; _username: string; _email: string }; Returns: Json }
      filter_books: {
        Args: { _query?: string | null; _genre_ids?: string[] | null; _statuses?: WorkStatus[] | null }
        Returns: BookRow[]
        SetofOptions: { from: '*'; to: 'books'; isOneToOne: false; isSetofReturn: true }
      }
      is_admin: { Args: NoFunctionArgs; Returns: boolean }
      is_staff: { Args: NoFunctionArgs; Returns: boolean }
      can_read_catalog: { Args: NoFunctionArgs; Returns: boolean }
      set_book_genres: { Args: { _book_id: string; _genre_ids: string[] }; Returns: undefined }
      set_book_status: { Args: { _book_id: string; _status: WorkStatus }; Returns: undefined }
      submit_book: { Args: { _book_id: string }; Returns: string }
      start_book_revision: { Args: { _book_id: string }; Returns: BookRevisionRow }
      submit_book_revision: { Args: { _revision_id: string }; Returns: string }
      create_chapter: {
        Args: { _book_id: string; _number?: number | null; _title?: string }
        Returns: ChapterRow
      }
      start_chapter_revision: { Args: { _chapter_id: string }; Returns: ChapterRevisionRow }
      submit_chapter_revision: { Args: { _revision_id: string }; Returns: string }
      cancel_submission: { Args: { _queue_id: string }; Returns: undefined }
      approve_submission: { Args: { _queue_id: string; _note?: string | null }; Returns: undefined }
      reject_submission: { Args: { _queue_id: string; _reason: string }; Returns: undefined }
      set_book_hidden: { Args: { _book_id: string; _hidden: boolean; _reason?: string | null }; Returns: undefined }
      resolve_report: {
        Args: { _report_id: string; _status: ReportStatus; _note?: string | null }
        Returns: undefined
      }
      create_invite: {
        Args: {
          _email?: string | null
          _role?: AppRole
          _max_uses?: number
          _expires_in_days?: number | null
          _note?: string | null
        }
        Returns: InviteRow
      }
      revoke_invite: { Args: { _invite_id: string }; Returns: undefined }
      set_user_role: { Args: { _user_id: string; _role: AppRole; _enabled: boolean }; Returns: undefined }
      admin_list_users: { Args: NoFunctionArgs; Returns: AdminUserRow[] }
      update_app_settings: {
        Args: { _registration_mode: string | null; _catalog_access: string | null }
        Returns: AppSettingsRow
      }
      chapter_like_info: { Args: { _chapter_id: string }; Returns: Json }
      toggle_chapter_like: { Args: { _chapter_id: string }; Returns: Json }
      mark_chapter_read: { Args: { _chapter_id: string }; Returns: undefined }
      book_chapter_stats: { Args: { _book_id: string }; Returns: ChapterStatsRow[] }
      follow_info: { Args: { _author_id: string }; Returns: Json }
      toggle_follow: { Args: { _author_id: string }; Returns: Json }
      my_ban: { Args: NoFunctionArgs; Returns: Json }
      set_user_ban: { Args: { _user_id: string; _banned: boolean; _reason?: string | null }; Returns: undefined }
      staff_edit_chapter: {
        Args: { _chapter_id: string; _title: string; _content: Json; _note?: string | null }
        Returns: undefined
      }
      staff_delete_chapter: { Args: { _chapter_id: string; _reason: string }; Returns: undefined }
    }
    Enums: {
      app_role: AppRole
      work_status: WorkStatus
      publication_state: PublicationState
      revision_state: RevisionState
      moderation_kind: ModerationKind
      moderation_status: ModerationStatus
      library_status: LibraryStatus
      report_target: ReportTarget
      report_status: ReportStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}
