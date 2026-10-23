import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { getErrorMessage } from '@/lib/errors'
import type { AppRole } from '@/types/database'
import { fetchBans, setUserBan, setUserRole } from './api'

/** Роли, которые администратор выдаёт и снимает («Читатель» есть у всех). */
export const MANAGED_ROLES = ['author', 'moderator', 'admin'] as const satisfies readonly AppRole[]

export const adminKeys = {
  users: ['admin', 'users'] as const,
  bans: ['admin', 'bans'] as const,
}

export function useBans() {
  const { isAdmin } = useAuth()
  return useQuery({ queryKey: adminKeys.bans, queryFn: fetchBans, enabled: isAdmin })
}

/** Смена ролей и блокировка участника (только для администратора). */
export function useUserAdminActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.users })
    void queryClient.invalidateQueries({ queryKey: adminKeys.bans })
    void queryClient.invalidateQueries({ queryKey: ['profile'] })
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const setRole = useMutation({
    mutationFn: ({ userId, role, enabled }: { userId: string; role: AppRole; enabled: boolean }) =>
      setUserRole(userId, role, enabled),
    onSuccess: () => {
      toast.success('Роли обновлены')
      refresh()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const setBan = useMutation({
    mutationFn: ({ userId, banned, reason }: { userId: string; banned: boolean; reason?: string }) =>
      setUserBan(userId, banned, reason),
    onSuccess: (_data, { banned }) => {
      toast.success(banned ? 'Участник заблокирован' : 'Блокировка снята')
      refresh()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return { setRole, setBan }
}
