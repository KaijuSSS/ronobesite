import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ReaderTheme = 'dark' | 'light' | 'sepia'
export type ReaderFont = 'literata' | 'pt-serif' | 'lora' | 'inter'

export const READER_FONTS: Record<ReaderFont, { label: string; stack: string }> = {
  literata: { label: 'Literata', stack: "'Literata', Georgia, serif" },
  'pt-serif': { label: 'PT Serif', stack: "'PT Serif', Georgia, serif" },
  lora: { label: 'Lora', stack: "'Lora', Georgia, serif" },
  inter: { label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
}

export const READER_THEMES: Record<ReaderTheme, { label: string; bg: string; fg: string; muted: string; panel: string }> = {
  dark: { label: 'Тёмная', bg: '#101115', fg: '#d9d9e3', muted: '#8c8d9c', panel: '#17181e' },
  light: { label: 'Светлая', bg: '#fbfbfd', fg: '#1d1d24', muted: '#6b6b78', panel: '#ffffff' },
  sepia: { label: 'Сепия', bg: '#f4ecd8', fg: '#433422', muted: '#7d6a52', panel: '#ede2c9' },
}

export const FONT_SIZE = { min: 14, max: 28, step: 1 }
export const LINE_HEIGHT = { min: 1.3, max: 2.2, step: 0.05 }
export const TEXT_WIDTH = { min: 520, max: 1000, step: 20 }

export type ReaderSettings = {
  theme: ReaderTheme
  font: ReaderFont
  fontSize: number
  lineHeight: number
  width: number
  justify: boolean
  /** Скрывать панели при прокрутке вниз. */
  autoHideUi: boolean
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'dark',
  font: 'literata',
  fontSize: 18,
  lineHeight: 1.75,
  width: 720,
  justify: false,
  autoHideUi: true,
}

type ReaderSettingsState = ReaderSettings & {
  update: (patch: Partial<ReaderSettings>) => void
  reset: () => void
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value))

export function sanitizeSettings(value: Partial<ReaderSettings>): ReaderSettings {
  const merged = { ...DEFAULT_READER_SETTINGS, ...value }
  return {
    theme: merged.theme in READER_THEMES ? merged.theme : DEFAULT_READER_SETTINGS.theme,
    font: merged.font in READER_FONTS ? merged.font : DEFAULT_READER_SETTINGS.font,
    fontSize: clamp(Number(merged.fontSize) || DEFAULT_READER_SETTINGS.fontSize, FONT_SIZE),
    lineHeight: clamp(Number(merged.lineHeight) || DEFAULT_READER_SETTINGS.lineHeight, LINE_HEIGHT),
    width: clamp(Number(merged.width) || DEFAULT_READER_SETTINGS.width, TEXT_WIDTH),
    justify: Boolean(merged.justify),
    autoHideUi: Boolean(merged.autoHideUi),
  }
}

export const useReaderSettings = create<ReaderSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_READER_SETTINGS,
      update: (patch) => set((state) => sanitizeSettings({ ...state, ...patch })),
      reset: () => set(DEFAULT_READER_SETTINGS),
    }),
    {
      name: 'ranobesite:reader-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => sanitizeSettings(state),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings((persisted ?? {}) as Partial<ReaderSettings>) }),
    },
  ),
)
