import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useReaderSettings } from '@/features/reader/settings-store'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'

describe('ReaderSettingsPanel', () => {
  beforeEach(() => useReaderSettings.getState().reset())

  it('переключает тему, шрифт и размер текста', async () => {
    const user = userEvent.setup()
    render(<ReaderSettingsPanel />)

    await user.click(screen.getByRole('radio', { name: /Светлая/ }))
    expect(useReaderSettings.getState().theme).toBe('light')

    await user.click(screen.getByRole('radio', { name: 'PT Serif' }))
    expect(useReaderSettings.getState().font).toBe('pt-serif')

    await user.click(screen.getByRole('button', { name: 'Увеличить шрифт' }))
    await user.click(screen.getByRole('button', { name: 'Увеличить шрифт' }))
    expect(useReaderSettings.getState().fontSize).toBe(20)

    await user.click(screen.getByRole('button', { name: 'Уменьшить шрифт' }))
    expect(useReaderSettings.getState().fontSize).toBe(19)
  })

  it('сбрасывает настройки', async () => {
    const user = userEvent.setup()
    useReaderSettings.getState().update({ theme: 'sepia', fontSize: 24, justify: true })
    render(<ReaderSettingsPanel />)
    await user.click(screen.getByRole('button', { name: /Сбросить настройки/ }))
    expect(useReaderSettings.getState()).toMatchObject({ theme: 'dark', fontSize: 18, justify: false })
  })
})
