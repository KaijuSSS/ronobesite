// Локальное сохранение места чтения (для гостей и как мгновенный кэш
// для вошедших пользователей — сервер может ответить с задержкой).

const KEY = 'ranobesite:reading-progress'
const MAX_BOOKS = 200

export type LocalProgress = {
  chapterId: string
  position: number
  updatedAt: number
}

type Store = Record<string, LocalProgress>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

function write(store: Store) {
  try {
    const entries = Object.entries(store)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_BOOKS)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Хранилище переполнено или недоступно — не критично.
  }
}

export function getLocalProgress(bookId: string): LocalProgress | null {
  const item = read()[bookId]
  if (!item || typeof item.chapterId !== 'string' || typeof item.position !== 'number') return null
  return item
}

export function setLocalProgress(bookId: string, chapterId: string, position: number) {
  const store = read()
  store[bookId] = { chapterId, position: Math.min(1, Math.max(0, position)), updatedAt: Date.now() }
  write(store)
}
