import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSupabaseClientForTests, type AppSupabaseClient } from '@/lib/supabase'
import { getErrorMessage } from '@/lib/errors'
import {
  MAX_CHAPTER_BYTES,
  cancelSubmission,
  saveChapterRevision,
  submitBook,
  submitChapterRevision,
  updateDraftBook,
} from './api'

type RpcResult = { data: unknown; error: unknown }

/** Минимальный двойник supabase-js: записывает вызовы rpc и update. */
function fakeClient(options: { rpc?: (name: string, args: unknown) => RpcResult; updatedRows?: unknown[] } = {}) {
  const rpc = vi.fn((name: string, args: unknown) => Promise.resolve(options.rpc?.(name, args) ?? { data: null, error: null }))
  const select = vi.fn(() => Promise.resolve({ data: options.updatedRows ?? [], error: null }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  const client = { rpc, from } as unknown as AppSupabaseClient
  setSupabaseClientForTests(client)
  return { rpc, from, update }
}

afterEach(() => setSupabaseClientForTests(null))

describe('отправка заявок на модерацию', () => {
  it('submitBook вызывает защищённую функцию базы', async () => {
    const { rpc } = fakeClient({ rpc: () => ({ data: 'queue-1', error: null }) })
    await submitBook('book-1')
    expect(rpc).toHaveBeenCalledWith('submit_book', { _book_id: 'book-1' })
  })

  it('ошибка базы передаётся пользователю понятным сообщением', async () => {
    fakeClient({
      rpc: () => ({ data: null, error: { code: 'P0001', message: 'Выберите хотя бы один жанр' } }),
    })
    const error = await submitBook('book-1').catch((e: unknown) => e)
    expect(getErrorMessage(error)).toBe('Выберите хотя бы один жанр')
  })

  it('submitChapterRevision и cancelSubmission передают идентификаторы', async () => {
    const { rpc } = fakeClient()
    await submitChapterRevision('rev-1')
    await cancelSubmission('queue-7')
    expect(rpc).toHaveBeenNthCalledWith(1, 'submit_chapter_revision', { _revision_id: 'rev-1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'cancel_submission', { _queue_id: 'queue-7' })
  })

  it('отказ RLS при сохранении отправленной версии не выдаётся за успех', async () => {
    // RLS не даёт изменить версию на проверке: update возвращает 0 строк.
    fakeClient({ updatedRows: [] })
    await expect(saveChapterRevision('rev-1', 'Глава', { type: 'doc', content: [] })).rejects.toThrow(
      /уже отправлена на проверку/,
    )
  })

  it('слишком большая глава отклоняется до запроса', async () => {
    const { from } = fakeClient()
    const huge = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'а'.repeat(MAX_CHAPTER_BYTES) }] }] }
    await expect(saveChapterRevision('rev-1', 'Глава', huge)).rejects.toThrow(/слишком большая/)
    expect(from).not.toHaveBeenCalled()
  })

  it('черновик, ушедший на проверку, нельзя тихо перезаписать', async () => {
    fakeClient({ updatedRows: [] })
    await expect(
      updateDraftBook('book-1', {
        title: 'Новое',
        description: '',
        status: 'ongoing',
        is_adult: false,
        cover_path: null,
        genre_ids: [],
      }),
    ).rejects.toThrow(/уже отправлено на проверку/)
  })
})
