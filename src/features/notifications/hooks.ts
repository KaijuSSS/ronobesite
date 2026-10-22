import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks'
import { deleteNotification, fetchNotifications, fetchUnreadCount, markAllRead, markRead } from './api'

export const notificationKeys = {
  all: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  list: ['notifications', 'list'] as const,
}

export function useUnreadNotifications() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: fetchUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

export function useNotifications() {
  return useQuery({ queryKey: notificationKeys.list, queryFn: () => fetchNotifications() })
}

export function useNotificationActions() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all })
  return {
    markAll: useMutation({ mutationFn: markAllRead, onSuccess }),
    markOne: useMutation({ mutationFn: markRead, onSuccess }),
    remove: useMutation({ mutationFn: deleteNotification, onSuccess }),
  }
}
