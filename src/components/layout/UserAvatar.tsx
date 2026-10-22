import { useQuery } from '@tanstack/react-query'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { signMediaPath } from '@/lib/media'
import { cn } from '@/lib/utils'

type UserAvatarProps = {
  profile: { username: string; display_name: string | null; avatar_path: string | null } | null | undefined
  className?: string
}

function initials(name: string) {
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function UserAvatar({ profile, className }: UserAvatarProps) {
  const path = profile?.avatar_path
  const { data: url } = useQuery({
    queryKey: ['media', path],
    queryFn: () => signMediaPath(path),
    enabled: Boolean(path),
    staleTime: 45 * 60 * 1000,
  })
  const name = profile?.display_name || profile?.username || '?'

  return (
    <Avatar className={cn('size-9 border border-white/10', className)}>
      {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-white">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
