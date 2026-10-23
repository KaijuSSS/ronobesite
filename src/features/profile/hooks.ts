import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errors'
import { fetchFollowInfo, toggleFollow } from './api'

export const followKeys = {
  info: (authorId: string) => ['follow', authorId] as const,
}

export function useFollowInfo(authorId: string | undefined) {
  return useQuery({
    queryKey: followKeys.info(authorId ?? ''),
    queryFn: () => fetchFollowInfo(authorId as string),
    enabled: Boolean(authorId),
  })
}

export function useToggleFollow(authorId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => toggleFollow(authorId),
    onSuccess: (next) => {
      queryClient.setQueryData(followKeys.info(authorId), next)
      toast.success(next.following ? 'Вы подписались: новые главы будут приходить в уведомления' : 'Вы отписались')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
}
