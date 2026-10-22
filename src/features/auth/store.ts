import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

type AuthState = {
  /** Сессия ещё не восстановлена из localStorage. */
  initializing: boolean
  session: Session | null
  /** Пользователь перешёл по ссылке восстановления пароля. */
  passwordRecovery: boolean
  setSession: (session: Session | null) => void
  setInitialized: () => void
  setPasswordRecovery: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  initializing: true,
  session: null,
  passwordRecovery: false,
  setSession: (session) => set({ session }),
  setInitialized: () => set({ initializing: false }),
  setPasswordRecovery: (passwordRecovery) => set({ passwordRecovery }),
}))
