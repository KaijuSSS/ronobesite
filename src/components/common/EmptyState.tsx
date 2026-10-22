import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative mx-auto flex max-w-md flex-col items-center text-center',
        compact ? 'gap-3 py-8' : 'gap-4 py-16 sm:py-24',
        className,
      )}
    >
      <div className="relative">
        <div aria-hidden className="bg-brand-gradient absolute inset-0 rounded-full opacity-25 blur-2xl" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-white/5 bg-card shadow-lg shadow-black/30">
          <Icon className="size-7 text-primary" aria-hidden />
        </div>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-balance">{title}</h2>
        {description ? <div className="text-sm text-pretty text-muted-foreground">{description}</div> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}
