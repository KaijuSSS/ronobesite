import { Loader2 } from 'lucide-react'

export function PageLoader({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
