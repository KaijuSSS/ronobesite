// Публичная конфигурация клиента. Значения подставляются Vite при сборке.
// Здесь допустимы только публичные ключи: anon / publishable key.

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

function looksLikePlaceholder(value: string) {
  return value === '' || value.includes('your-project-ref') || value.includes('your-anon')
}

/** Отказываемся работать с секретным ключом, если его по ошибке положили в .env. */
function isSecretKey(key: string) {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown }
    return json.role === 'service_role'
  } catch {
    return false
  }
}

export type EnvProblem = 'missing' | 'secret-key'

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  baseUrl: import.meta.env.BASE_URL,
  problem: (looksLikePlaceholder(url) || looksLikePlaceholder(anonKey)
    ? 'missing'
    : isSecretKey(anonKey)
      ? 'secret-key'
      : null) as EnvProblem | null,
}

export const isSupabaseConfigured = env.problem === null
