import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveProgress } from '@/features/library/api'
import { libraryKeys } from '@/features/library/hooks'
import { setLocalProgress } from './local-progress'

/** Минимальный интервал между запросами сохранения на сервер. */
export const SERVER_SAVE_INTERVAL_MS = 8000
/** Изменение позиции меньше этого порога не сохраняем. */
const MIN_DELTA = 0.01

type Options = {
  bookId: string | undefined
  chapterId: string | undefined
  isAuthenticated: boolean
  /** Отключено, пока восстанавливается позиция (иначе запишем 0). */
  enabled: boolean
  getPosition: () => number
}

/**
 * Автосохранение позиции чтения.
 * Локально — при каждой прокрутке (дёшево), на сервер — не чаще раза в
 * SERVER_SAVE_INTERVAL_MS, а также при уходе со страницы или сворачивании вкладки.
 */
export function useReadingProgress({ bookId, chapterId, isAuthenticated, enabled, getPosition }: Options) {
  const queryClient = useQueryClient()
  const lastSent = useRef<{ position: number; at: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const getPositionRef = useRef(getPosition)
  useEffect(() => {
    getPositionRef.current = getPosition
  }, [getPosition])

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (!bookId || !chapterId || !isAuthenticated || !enabled) return
    const position = getPositionRef.current()
    const last = lastSent.current
    if (last && Math.abs(last.position - position) < MIN_DELTA) return
    lastSent.current = { position, at: Date.now() }
    saveProgress(bookId, chapterId, position)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: libraryKeys.progress(bookId) })
      })
      .catch((error: unknown) => {
        // Не мешаем чтению: локальная копия уже сохранена.
        console.warn('Не удалось сохранить прогресс чтения', error)
        lastSent.current = null
      })
  }, [bookId, chapterId, enabled, isAuthenticated, queryClient])

  const report = useCallback(() => {
    if (!bookId || !chapterId || !enabled) return
    setLocalProgress(bookId, chapterId, getPositionRef.current())
    if (!isAuthenticated) return

    const since = lastSent.current ? Date.now() - lastSent.current.at : Infinity
    if (since >= SERVER_SAVE_INTERVAL_MS) {
      flush()
    } else if (!timer.current) {
      timer.current = setTimeout(flush, SERVER_SAVE_INTERVAL_MS - since)
    }
  }, [bookId, chapterId, enabled, flush, isAuthenticated])

  // Новая глава — сбрасываем память о последней отправке.
  useEffect(() => {
    lastSent.current = null
  }, [chapterId])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { report, flush }
}
