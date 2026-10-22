// Приведение ошибок Supabase / сети к понятным сообщениям на русском.

type MaybeError = {
  message?: unknown
  code?: unknown
  status?: unknown
  name?: unknown
}

export class AppError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Неверный e-mail или пароль'],
  [/email not confirmed/i, 'E-mail ещё не подтверждён. Проверьте почту и перейдите по ссылке из письма.'],
  [/user already registered|already been registered/i, 'Пользователь с таким e-mail уже зарегистрирован'],
  [/database error saving new user/i, 'Регистрация отклонена: проверьте код приглашения и имя пользователя'],
  [/password should be at least|password.*(short|length)/i, 'Пароль слишком короткий'],
  [/weak password|password is known to be weak/i, 'Пароль слишком простой — выберите другой'],
  [/rate limit|too many requests/i, 'Слишком много попыток. Подождите немного и повторите.'],
  [/signups not allowed|signup.*disabled/i, 'Регистрация на сайте сейчас отключена'],
  [/invalid.*(email|e-mail)|unable to validate email/i, 'Некорректный адрес e-mail'],
  [/same password|should be different/i, 'Новый пароль должен отличаться от старого'],
  [/(code verifier|flow state|otp).*(expired|invalid|not found)|expired|invalid.*(token|code)/i, 'Ссылка устарела или уже использована. Запросите новую.'],
  [/jwt expired|refresh token/i, 'Сессия истекла. Войдите снова.'],
]

function isNetworkError(error: MaybeError) {
  const message = typeof error.message === 'string' ? error.message : ''
  return (
    (error.name === 'TypeError' && /fetch|network|load failed/i.test(message)) ||
    /failed to fetch|networkerror|network request failed/i.test(message)
  )
}

/** Возвращает текст ошибки, который можно показать пользователю. */
export function getErrorMessage(error: unknown, fallback = 'Что-то пошло не так. Попробуйте ещё раз.'): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error instanceof AppError) return error.message

  const e = error as MaybeError
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : undefined

  if (isNetworkError(e)) return 'Нет соединения с сервером. Проверьте интернет и повторите попытку.'

  // Наши SQL-функции выбрасывают понятные сообщения с кодом P0001/P0002.
  if (code === 'P0001' || code === 'P0002') return message || fallback

  if (code === '42501') {
    // Сообщения наших функций на русском — показываем как есть.
    if (/[а-яё]/i.test(message)) return message
    return 'Недостаточно прав для этого действия'
  }
  if (code === '23505') return 'Такая запись уже существует'
  if (code === '23514') return 'Данные не прошли проверку. Проверьте заполнение полей.'
  if (code === '23503') return 'Связанная запись не найдена или используется'
  if (code === 'PGRST116') return 'Запись не найдена'
  if (code === 'PGRST301' || code === 'PGRST303') return 'Сессия истекла. Войдите снова.'

  for (const [pattern, text] of AUTH_MESSAGES) {
    if (pattern.test(message)) return text
  }

  if (/payload too large|exceeded the maximum allowed size|entity too large/i.test(message)) {
    return 'Файл слишком большой'
  }
  if (/mime type|invalid.*type/i.test(message)) return 'Недопустимый тип файла'

  if (/[а-яё]/i.test(message)) return message
  return fallback
}

/** Бросает исключение, если запрос Supabase вернул ошибку. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error
  return result.data
}

/** Для запросов, которые обязаны вернуть одну запись (single(), RPC с returning). */
export function unwrapOne<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error
  if (result.data === null || result.data === undefined) throw new AppError('Сервер вернул пустой ответ')
  return result.data
}

/** То же для списков: вместо null возвращает пустой массив. */
export function unwrapList<T>(result: { data: T[] | null; error: unknown }): T[] {
  if (result.error) throw result.error
  return result.data ?? []
}
