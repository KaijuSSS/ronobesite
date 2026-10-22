import { getSupabase } from './supabase'
import { AppError } from './errors'

// Бакет приватный: изображения отдаются по временным подписанным ссылкам.
export const MEDIA_BUCKET = 'media'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const SIGNED_URL_TTL_SECONDS = 60 * 60
// Ссылку обновляем заранее, за 10 минут до истечения.
const CACHE_TTL_MS = (SIGNED_URL_TTL_SECONDS - 10 * 60) * 1000

const cache = new Map<string, { url: string; expiresAt: number }>()

function cached(path: string): string | null {
  const entry = cache.get(path)
  if (entry && entry.expiresAt > Date.now()) return entry.url
  return null
}

/** Подписывает пачку путей одним запросом. Возвращает map путь → URL. */
export async function signMediaPaths(paths: Array<string | null | undefined>): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const missing: string[] = []

  for (const path of new Set(paths.filter((p): p is string => Boolean(p)))) {
    const url = cached(path)
    if (url) result.set(path, url)
    else missing.push(path)
  }

  if (missing.length > 0) {
    const { data, error } = await getSupabase().storage.from(MEDIA_BUCKET).createSignedUrls(missing, SIGNED_URL_TTL_SECONDS)
    if (error) {
      // Отсутствие картинки не должно ломать страницу: показываем заглушку.
      console.warn('Не удалось получить ссылки на изображения', error)
      return result
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        cache.set(item.path, { url: item.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS })
        result.set(item.path, item.signedUrl)
      }
    }
  }

  return result
}

export async function signMediaPath(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const map = await signMediaPaths([path])
  return map.get(path) ?? null
}

/** Добавляет поле coverUrl к списку книг одним запросом подписи. */
export async function withCoverUrls<T extends { cover_path: string | null }>(
  items: T[],
): Promise<Array<T & { coverUrl: string | null }>> {
  const urls = await signMediaPaths(items.map((i) => i.cover_path))
  return items.map((item) => ({ ...item, coverUrl: item.cover_path ? (urls.get(item.cover_path) ?? null) : null }))
}

export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new AppError('Поддерживаются только изображения JPEG, PNG и WebP')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError('Размер изображения не должен превышать 5 МБ')
  }
}

/**
 * Уменьшает изображение и перекодирует в WebP, чтобы обложки грузились
 * быстрее. Если браузер не умеет — возвращает исходный файл.
 */
async function shrinkImage(file: File, maxWidth: number, maxHeight: number): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
    return blob && blob.size < file.size * 1.2 && blob.type === 'image/webp' ? blob : file
  } catch {
    return file
  }
}

export type MediaFolder = 'covers' | 'avatars'

/** Загружает изображение в папку пользователя и возвращает путь в бакете. */
export async function uploadImage(file: File, folder: MediaFolder, userId: string): Promise<string> {
  validateImageFile(file)
  const limits = folder === 'covers' ? [900, 1350] : [400, 400]
  const blob = await shrinkImage(file, limits[0], limits[1])
  const type = blob.type || file.type
  const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg'
  const path = `${folder}/${userId}/${crypto.randomUUID()}.${ext}`

  const { error } = await getSupabase().storage.from(MEDIA_BUCKET).upload(path, blob, {
    contentType: type,
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removeImage(path: string | null | undefined): Promise<void> {
  if (!path) return
  const { error } = await getSupabase().storage.from(MEDIA_BUCKET).remove([path])
  if (error) console.warn('Не удалось удалить старое изображение', error)
  cache.delete(path)
}
