import { renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '@/test/utils'
import { getLocalProgress } from './local-progress'
import { SERVER_SAVE_INTERVAL_MS, useReadingProgress } from './useReadingProgress'

const saveProgress = vi.fn<(bookId: string, chapterId: string, position: number) => Promise<void>>()
vi.mock('@/features/library/api', () => ({
  saveProgress: (bookId: string, chapterId: string, position: number) => saveProgress(bookId, chapterId, position),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

describe('useReadingProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveProgress.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ограничивает частоту запросов к серверу', () => {
    let position = 0.1
    const { result } = renderHook(
      () =>
        useReadingProgress({
          bookId: 'book-1',
          chapterId: 'ch-1',
          isAuthenticated: true,
          enabled: true,
          getPosition: () => position,
        }),
      { wrapper },
    )

    // Десятки событий прокрутки подряд — один запрос.
    for (let i = 0; i < 30; i++) {
      position = 0.1 + i * 0.01
      result.current.report()
    }
    expect(saveProgress).toHaveBeenCalledTimes(1)

    // После паузы отправляется последнее значение.
    vi.advanceTimersByTime(SERVER_SAVE_INTERVAL_MS)
    expect(saveProgress).toHaveBeenCalledTimes(2)
    expect(saveProgress).toHaveBeenLastCalledWith('book-1', 'ch-1', position)

    // Локальная копия обновляется сразу.
    expect(getLocalProgress('book-1')).toMatchObject({ chapterId: 'ch-1', position })
  })

  it('для гостя сохраняет только локально', () => {
    const { result } = renderHook(
      () =>
        useReadingProgress({
          bookId: 'book-2',
          chapterId: 'ch-9',
          isAuthenticated: false,
          enabled: true,
          getPosition: () => 0.42,
        }),
      { wrapper },
    )
    result.current.report()
    vi.advanceTimersByTime(SERVER_SAVE_INTERVAL_MS * 2)
    expect(saveProgress).not.toHaveBeenCalled()
    expect(getLocalProgress('book-2')).toMatchObject({ chapterId: 'ch-9', position: 0.42 })
  })

  it('не сохраняет, пока позиция не восстановлена', () => {
    const { result } = renderHook(
      () =>
        useReadingProgress({
          bookId: 'book-3',
          chapterId: 'ch-1',
          isAuthenticated: true,
          enabled: false,
          getPosition: () => 0,
        }),
      { wrapper },
    )
    result.current.report()
    expect(saveProgress).not.toHaveBeenCalled()
    expect(getLocalProgress('book-3')).toBeNull()
  })
})
