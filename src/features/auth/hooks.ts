import { useQuery } from '@tanstack/react-query'
import type { AppRole } from '@/types/database'
import { useAuthStore } from './store'
import { fetchCurrentUser, fetchPublicConfig } from './api'

/** Роли, которым доступна Студия (совпадает с public.can_write() в базе). */
export const WRITER_ROLES: AppRole[] = ['author', 'moderator', 'admin']

export const authKeys = {
  config: ['public-config'] as const,
  me: (userId: string | undefined) => ['me', userId] as const,
}

export function usePublicConfig() {
  return useQuery({
    queryKey: authKeys.config,
    queryFn: fetchPublicConfig,
    staleTime: 5 * 60 * 1000,
  })
}

/** Текущий пользователь: сессия, профиль и роли. */
export function useAuth() {
  const session = useAuthStore((s) => s.session)
  const initializing = useAuthStore((s) => s.initializing)
  const userId = session?.user.id

  const me = useQuery({
    queryKey: authKeys.me(userId),
    queryFn: () => fetchCurrentUser(userId as string),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  })

  const roles = me.data?.roles ?? []
  const ban = me.data?.ban ?? null
  return {
    session,
    user: session?.user ?? null,
    userId,
    profile: me.data?.profile ?? null,
    roles,
    isAuthenticated: Boolean(session),
    isAdmin: roles.includes('admin'),
    isStaff: roles.includes('admin') || roles.includes('moderator'),
    /** Может создавать произведения и главы (роли «Автор», модератор, администратор). */
    canWrite: !ban && WRITER_ROLES.some((role) => roles.includes(role)),
    /** Блокировка аккаунта администратором (причина и дата) или null. */
    ban,
    /** Пока true — неизвестно, вошёл ли пользователь и какие у него роли. */
    isLoading: initializing || (Boolean(userId) && me.isPending),
    error: me.error,
  }
}

/** Может ли посетитель видеть каталог (вошёл или каталог открыт для всех). */
export function useCatalogAccess() {
  const auth = useAuth()
  const config = usePublicConfig()
  const isPublic = config.data?.catalog_access === 'public'
  return {
    canRead: !auth.ban && (auth.isAuthenticated || isPublic),
    isLoading: auth.isLoading || (!auth.isAuthenticated && config.isPending),
    config: config.data,
  }
}
