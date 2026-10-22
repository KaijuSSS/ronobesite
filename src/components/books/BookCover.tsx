import { useState } from 'react'
import { cn } from '@/lib/utils'

const PALETTES = [
  ['#7c3aed', '#2563eb'],
  ['#db2777', '#7c3aed'],
  ['#0891b2', '#4f46e5'],
  ['#9333ea', '#0ea5e9'],
  ['#4338ca', '#06b6d4'],
  ['#be185d', '#4338ca'],
  ['#0f766e', '#4f46e5'],
  ['#6d28d9', '#c026d3'],
]

function hash(value: string) {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

type BookCoverProps = {
  title: string
  url: string | null
  className?: string
  adult?: boolean
  /** Размытие обложки 18+ (снимается по клику на странице книги). */
  blurAdult?: boolean
  /** Маленькая обложка: в заглушке не выводить название. */
  small?: boolean
}

/** Обложка книги; без изображения рисуется градиентная заглушка с названием. */
export function BookCover({ title, url, className, adult, blurAdult = false, small = false }: BookCoverProps) {
  const [failed, setFailed] = useState(false)
  const [from, to] = PALETTES[hash(title) % PALETTES.length]
  const showImage = url && !failed

  return (
    <div
      className={cn(
        'relative aspect-[2/3] overflow-hidden rounded-xl bg-muted shadow-lg shadow-black/30 ring-1 ring-white/5',
        className,
      )}
    >
      {showImage ? (
        <img
          src={url}
          alt={`Обложка: ${title}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-cover transition-transform duration-500',
            blurAdult && adult && 'scale-110 blur-xl',
          )}
        />
      ) : (
        <div
          className="flex size-full flex-col justify-between p-3"
          style={{ backgroundImage: `linear-gradient(150deg, ${from}, ${to})` }}
          role="img"
          aria-label={`Обложка: ${title}`}
        >
          <div aria-hidden className="h-0.5 w-8 rounded bg-white/60" />
          {small ? null : (
            <p className="line-clamp-4 font-display text-sm leading-snug font-semibold text-white drop-shadow">{title}</p>
          )}
          <div aria-hidden className="absolute -right-8 -bottom-8 size-28 rounded-full bg-white/10" />
        </div>
      )}
      {adult ? (
        <span className="absolute top-2 left-2 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
          18+
        </span>
      ) : null}
    </div>
  )
}
