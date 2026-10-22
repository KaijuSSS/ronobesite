const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const relativeFormatter = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' })

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
]

export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '—'
  const seconds = (new Date(value).getTime() - now.getTime()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeFormatter.format(Math.round(seconds / size), unit)
    }
  }
  return 'только что'
}

/** Склонение: plural(5, ['глава', 'главы', 'глав']) → «глав». */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function formatCount(n: number, forms: [string, string, string]): string {
  return `${n.toLocaleString('ru-RU')} ${plural(n, forms)}`
}

export function formatRating(value: number, count: number): string {
  if (!count) return '—'
  return Number(value).toFixed(1).replace('.', ',')
}

export function formatChapterNumber(n: number): string {
  return Number.isInteger(Number(n)) ? String(Number(n)) : String(Number(n)).replace('.', ',')
}

export function displayName(profile: { username: string; display_name: string | null } | null | undefined): string {
  if (!profile) return 'Неизвестный автор'
  return profile.display_name?.trim() || profile.username
}

/** Примерное время чтения: ~180 слов в минуту. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 180))
}
