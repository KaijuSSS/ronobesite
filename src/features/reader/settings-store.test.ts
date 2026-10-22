import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_READER_SETTINGS, FONT_SIZE, sanitizeSettings, useReaderSettings } from './settings-store'

describe('настройки читалки', () => {
  beforeEach(() => {
    useReaderSettings.getState().reset()
  })

  it('изменяет настройки и ограничивает значения', () => {
    const { update } = useReaderSettings.getState()
    update({ fontSize: 100, theme: 'sepia' })
    expect(useReaderSettings.getState().fontSize).toBe(FONT_SIZE.max)
    expect(useReaderSettings.getState().theme).toBe('sepia')
    update({ fontSize: 1 })
    expect(useReaderSettings.getState().fontSize).toBe(FONT_SIZE.min)
  })

  it('сохраняет настройки в localStorage', () => {
    useReaderSettings.getState().update({ font: 'lora', lineHeight: 2 })
    const raw = localStorage.getItem('ranobesite:reader-settings')
    expect(raw).not.toBeNull()
    const stored = JSON.parse(raw as string) as { state: Record<string, unknown> }
    expect(stored.state).toMatchObject({ font: 'lora', lineHeight: 2 })
  })

  it('отбрасывает мусор из хранилища', () => {
    const settings = sanitizeSettings({
      theme: 'neon' as never,
      font: 'comic' as never,
      fontSize: Number.NaN,
      width: 5000,
    })
    expect(settings.theme).toBe(DEFAULT_READER_SETTINGS.theme)
    expect(settings.font).toBe(DEFAULT_READER_SETTINGS.font)
    expect(settings.fontSize).toBe(DEFAULT_READER_SETTINGS.fontSize)
    expect(settings.width).toBe(1000)
  })
})
