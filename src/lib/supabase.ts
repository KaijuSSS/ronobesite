import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env, isSupabaseConfigured } from './env'

export type AppSupabaseClient = SupabaseClient<Database>

let client: AppSupabaseClient | null = null

if (isSupabaseConfigured) {
  client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      // PKCE: ссылки из писем приходят с ?code=..., что совместимо с HashRouter.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

/**
 * Клиент Supabase. Если проект не настроен, приложение показывает экран
 * настройки и до вызовов API дело не доходит; ошибка здесь — страховка.
 */
export function getSupabase(): AppSupabaseClient {
  if (!client) {
    throw new Error('Supabase не настроен: заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local')
  }
  return client
}

/** Для тестов: подменить клиент. */
export function setSupabaseClientForTests(next: AppSupabaseClient | null) {
  client = next
}
