import { useNavigate } from 'react-router'
import { Ban, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { getErrorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import type { MyBan } from '@/types/database'
import { signOut } from './api'

/** Показывается вместо сайта заблокированному участнику. */
export function BannedScreen({ ban }: { ban: MyBan }) {
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={Ban}
        title="Аккаунт заблокирован"
        description={
          <>
            Администратор заблокировал ваш аккаунт. Дата блокировки: {formatDate(ban.banned_at)}
            <span className="mt-3 block rounded-xl border border-white/5 bg-card px-4 py-3 text-left text-foreground">
              Причина: {ban.reason}
            </span>
            <span className="mt-3 block">Если считаете это ошибкой, свяжитесь с администратором сайта.</span>
          </>
        }
        action={
          <Button variant="secondary" onClick={() => void handleSignOut()}>
            <LogOut /> Выйти
          </Button>
        }
      />
    </div>
  )
}
