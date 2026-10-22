import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type SearchBoxProps = {
  className?: string
  autoFocus?: boolean
  onSubmitted?: () => void
  size?: 'default' | 'lg'
}

/** Поиск по названию: переходит в каталог с параметром ?q=. */
export function SearchBox({ className, autoFocus, onSubmitted, size = 'default' }: SearchBoxProps) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const q = value.trim()
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog')
    onSubmitted?.()
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative', className)}>
      <label htmlFor="global-search" className="sr-only">
        Поиск произведений
      </label>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground',
          size === 'lg' ? 'size-5 left-4' : 'size-4',
        )}
        aria-hidden
      />
      <input
        id="global-search"
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Найти произведение…"
        className={cn(
          'w-full rounded-xl border border-white/5 bg-surface-2 text-sm text-foreground placeholder:text-muted-foreground',
          'transition-colors outline-none focus:border-primary/60 focus:bg-card focus:ring-3 focus:ring-primary/20',
          size === 'lg' ? 'h-12 pr-4 pl-11 text-base' : 'h-10 pr-3 pl-9',
        )}
      />
    </form>
  )
}
