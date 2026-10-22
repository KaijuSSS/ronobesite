import type {
  AppRole,
  LibraryStatus,
  ModerationKind,
  ModerationStatus,
  PublicationState,
  ReportStatus,
  ReportTarget,
  RevisionState,
  WorkStatus,
} from '@/types/database'

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  ongoing: 'Выходит',
  completed: 'Завершено',
  hiatus: 'Приостановлено',
  abandoned: 'Заброшено',
}

export const WORK_STATUSES = Object.keys(WORK_STATUS_LABELS) as WorkStatus[]

export const PUBLICATION_STATE_LABELS: Record<PublicationState, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  published: 'Опубликовано',
  rejected: 'Отклонено',
  hidden: 'Скрыто модератором',
}

export const REVISION_STATE_LABELS: Record<RevisionState, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Опубликовано',
  rejected: 'Отклонено',
  superseded: 'Заменено',
}

export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, string> = {
  reading: 'Читаю',
  planned: 'В планах',
  completed: 'Прочитано',
  dropped: 'Брошено',
}

export const LIBRARY_STATUSES = Object.keys(LIBRARY_STATUS_LABELS) as LibraryStatus[]

export const MODERATION_KIND_LABELS: Record<ModerationKind, string> = {
  book: 'Новое произведение',
  book_revision: 'Изменение произведения',
  chapter_revision: 'Глава',
}

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  rejected: 'Отклонено',
  cancelled: 'Отозвано автором',
}

export const ROLE_LABELS: Record<AppRole, string> = {
  reader: 'Читатель',
  moderator: 'Модератор',
  admin: 'Администратор',
}

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  book: 'Произведение',
  chapter: 'Глава',
  comment: 'Комментарий',
  review: 'Отзыв',
  profile: 'Профиль',
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Открыта',
  resolved: 'Решена',
  dismissed: 'Отклонена',
}

export const CHAPTER_FORMS: [string, string, string] = ['глава', 'главы', 'глав']
export const RATING_FORMS: [string, string, string] = ['оценка', 'оценки', 'оценок']
export const READER_FORMS: [string, string, string] = ['читатель', 'читателя', 'читателей']
export const WORD_FORMS: [string, string, string] = ['слово', 'слова', 'слов']
