import { getSupabase } from '@/lib/supabase'
import { AppError, unwrap } from '@/lib/errors'
import { env } from '@/lib/env'
import type { AppRole, MyBan, ProfileRow } from '@/types/database'

export type PublicConfig = {
  registration_mode: 'invite' | 'open'
  catalog_access: 'members' | 'public'
}

export type SignupCheck = {
  registration_mode: 'invite' | 'open'
  invite: 'ok' | 'invalid'
  username: 'ok' | 'taken' | 'invalid' | 'unknown'
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,24}$/

/** Формат кода в базе: латиница в верхнем регистре, цифры и дефисы. */
export const INVITE_CODE_PATTERN = /^[A-Z0-9-]{6,64}$/

// Кириллические буквы, которые выглядят как латинские.
const INVITE_LOOKALIKES: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P',
  С: 'C', Т: 'T', У: 'Y', Х: 'X', І: 'I', Ј: 'J', Ѕ: 'S',
}

/**
 * Исправляет типовые ошибки при вводе кода приглашения: пробелы и невидимые
 * символы после копирования, длинные тире и «_» вместо дефиса, похожие
 * кириллические буквы, строчные буквы.
 */
export function normalizeInviteCode(raw: string): string {
  return raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[_\u2010-\u2015\u2212]/g, '-')
    .replace(/[А-ЯЁІЈЅ]/g, (ch) => INVITE_LOOKALIKES[ch] ?? ch)
}

/** Адрес, куда Supabase вернёт пользователя из письма. */
export function authRedirectUrl(): string {
  return new URL(env.baseUrl, window.location.origin).toString()
}

export async function fetchPublicConfig(): Promise<PublicConfig> {
  const data = unwrap(await getSupabase().rpc('get_public_config'))
  const value = (data ?? {}) as Partial<PublicConfig>
  return {
    registration_mode: value.registration_mode === 'open' ? 'open' : 'invite',
    catalog_access: value.catalog_access === 'public' ? 'public' : 'members',
  }
}

export async function checkSignup(inviteCode: string, username: string, email: string): Promise<SignupCheck> {
  const data = unwrap(
    await getSupabase().rpc('check_signup', { _invite_code: inviteCode, _username: username, _email: email }),
  )
  return data as SignupCheck
}

export type SignUpInput = {
  email: string
  password: string
  username: string
  displayName?: string
  inviteCode?: string
}

export async function signUp(input: SignUpInput): Promise<{ needsEmailConfirmation: boolean }> {
  const config = await fetchPublicConfig()
  const inviteCode = normalizeInviteCode(input.inviteCode ?? '')
  const check = await checkSignup(inviteCode, input.username, input.email)

  if (config.registration_mode === 'invite' && check.invite !== 'ok') {
    throw new AppError('Приглашение недействительно: проверьте код, срок действия и e-mail')
  }
  if (check.username === 'taken') throw new AppError('Это имя пользователя уже занято')
  if (check.username === 'invalid') {
    throw new AppError('Имя пользователя: 3–24 символа, латинские буквы, цифры и «_»')
  }

  const { data, error } = await getSupabase().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: {
        username: input.username,
        display_name: input.displayName?.trim() || null,
        invite_code: inviteCode || null,
      },
    },
  })
  if (error) throw error

  // Если включено подтверждение e-mail, сессии ещё нет.
  // Пустой список identities означает, что адрес уже занят.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new AppError('Пользователь с таким e-mail уже зарегистрирован')
  }
  return { needsEmailConfirmation: !data.session }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) throw error
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() })
  if (error) throw error
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password })
  if (error) throw error
}

export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  })
  if (error) throw error
}

export type CurrentUser = {
  profile: ProfileRow | null
  roles: AppRole[]
  /** Блокировка аккаунта; null — не заблокирован. */
  ban: MyBan | null
}

export async function fetchCurrentUser(userId: string): Promise<CurrentUser> {
  const supabase = getSupabase()
  const [profile, roles, ban] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.rpc('my_ban'),
  ])
  if (ban.error) console.warn('Не удалось проверить блокировку аккаунта', ban.error)
  return {
    profile: unwrap(profile),
    roles: (unwrap(roles) ?? []).map((r) => r.role),
    ban: ban.error ? null : ((ban.data as MyBan | null) ?? null),
  }
}
