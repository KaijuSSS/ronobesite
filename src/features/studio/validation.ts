import type { BookFormValues } from './api'

export const MAX_GENRES = 8

export function validateBookForm(values: BookFormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!values.title.trim()) errors.title = 'Введите название'
  else if (values.title.trim().length > 200) errors.title = 'Не длиннее 200 символов'
  if (values.description.length > 5000) errors.description = 'Не длиннее 5000 символов'
  if (values.genre_ids.length > MAX_GENRES) errors.genres = `Не более ${MAX_GENRES} жанров`
  return errors
}
