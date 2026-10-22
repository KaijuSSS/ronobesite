import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-g)" />
      <path
        d="M9 9.5c2.6-.9 5-.6 7 1v12.2c-2-1.5-4.4-1.8-7-.9V9.5Zm14 0c-2.6-.9-5-.6-7 1v12.2c2-1.5 4.4-1.8 7-.9V9.5Z"
        fill="#fff"
        fillOpacity=".95"
      />
    </svg>
  )
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {compact ? null : (
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Ranobe<span className="text-brand-gradient">Site</span>
        </span>
      )}
    </span>
  )
}
