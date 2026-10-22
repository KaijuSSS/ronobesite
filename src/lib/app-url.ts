import { env } from './env'

/**
 * Полная ссылка на страницу приложения (для приглашений и копирования).
 * Сейчас используется HashRouter, поэтому путь идёт после «#».
 */
export function appUrl(path: string): string {
  const base = new URL(env.baseUrl, window.location.origin).toString()
  return `${base}#${path.startsWith('/') ? path : `/${path}`}`
}
