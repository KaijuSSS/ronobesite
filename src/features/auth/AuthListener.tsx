import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase'
import { useAuthStore } from './store'

/**
 * Синхронизирует сессию Supabase с хранилищем приложения.
 * Внутри onAuthStateChange нельзя вызывать другие методы supabase-js
 * (это может заблокировать клиент), поэтому здесь только обновление состояния.
 */
export function AuthListener() {
  const queryClient = useQueryClient()
  const setSession = useAuthStore((s) => s.setSession)
  const setInitialized = useAuthStore((s) => s.setInitialized)
  const setPasswordRecovery = useAuthStore((s) => s.setPasswordRecovery)

  useEffect(() => {
    const supabase = getSupabase()
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      .finally(() => {
        if (active) setInitialized()
      })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false)
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'public-config' })
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void queryClient.invalidateQueries({ queryKey: ['me'] })
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient, setInitialized, setPasswordRecovery, setSession])

  return null
}
