import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { signMediaPath } from '@/lib/media'
import { cn } from '@/lib/utils'

/** Изображение из текста главы. Ссылка подписывается при показе: бакет приватный. */
export function ChapterImage({ path, alt, className }: { path: string; alt?: string; className?: string }) {
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null)

  useEffect(() => {
    let active = true
    signMediaPath(path)
      .then((url) => active && setState({ path, url }))
      .catch(() => active && setState({ path, url: null }))
    return () => {
      active = false
    }
  }, [path])

  const loaded = state?.path === path ? state : null

  return (
    <figure className={cn('chapter-image', className)}>
      {loaded?.url ? (
        <img src={loaded.url} alt={alt || 'Иллюстрация к главе'} loading="lazy" decoding="async" />
      ) : (
        <div className="chapter-image-placeholder" aria-hidden={!loaded}>
          {loaded ? (
            <>
              <ImageOff className="size-5" aria-hidden /> Изображение недоступно
            </>
          ) : null}
        </div>
      )}
    </figure>
  )
}
