import { Ban, ShieldCheck, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ReasonDialog } from '@/components/common/ReasonDialog'
import { useAuth } from '@/features/auth/hooks'
import { formatDate } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/labels'
import type { AppRole } from '@/types/database'
import { MANAGED_ROLES, useBans, useUserAdminActions } from './hooks'

/** Кнопка «Заблокировать» / «Разблокировать». */
export function BanButton({ userId, name, isAdminUser }: { userId: string; name: string; isAdminUser: boolean }) {
  const { userId: me } = useAuth()
  const bans = useBans()
  const { setBan } = useUserAdminActions()
  const ban = bans.data?.get(userId)

  if (userId === me) return null
  if (ban) {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setBan.mutate({ userId, banned: false })}
        disabled={setBan.isPending}
      >
        <UserCheck /> Разблокировать
      </Button>
    )
  }
  return (
    <ReasonDialog
      trigger={
        <Button
          size="sm"
          variant="ghost"
          className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
          disabled={isAdminUser}
          title={isAdminUser ? 'Сначала снимите роль администратора' : undefined}
        >
          <Ban /> Заблокировать
        </Button>
      }
      title={`Заблокировать ${name}?`}
      description="Участник не сможет читать, писать, комментировать и ставить лайки. При входе он увидит причину. Блокировку можно снять в любой момент."
      label="Причина блокировки"
      placeholder="Например: оскорбления в комментариях"
      confirmLabel="Заблокировать"
      destructive
      onConfirm={(reason) => setBan.mutateAsync({ userId, banned: true, reason })}
    />
  )
}

/** Отметка «Заблокирован» с причиной (для администратора). */
export function BanNotice({ userId }: { userId: string }) {
  const bans = useBans()
  const ban = bans.data?.get(userId)
  if (!ban) return null
  return (
    <p className="text-xs text-red-300">
      Заблокирован {formatDate(ban.created_at)}: {ban.reason}
    </p>
  )
}

/** Блок управления участником в его профиле. Виден только администратору. */
export function UserAdminControls({ userId, name, roles }: { userId: string; name: string; roles: AppRole[] }) {
  const { isAdmin, userId: me } = useAuth()
  const { setRole } = useUserAdminActions()
  if (!isAdmin || userId === me) return null

  return (
    <section
      aria-labelledby="admin-controls-heading"
      className="space-y-4 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5"
    >
      <div>
        <h2 id="admin-controls-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-amber-300" aria-hidden /> Управление участником
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Видно только администраторам.</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {MANAGED_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2 text-sm">
            <Switch
              checked={roles.includes(role)}
              disabled={setRole.isPending}
              onCheckedChange={(enabled) => setRole.mutate({ userId, role, enabled })}
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
      <div className="space-y-2 border-t border-white/5 pt-4">
        <BanNotice userId={userId} />
        <BanButton userId={userId} name={name} isAdminUser={roles.includes('admin')} />
      </div>
    </section>
  )
}
