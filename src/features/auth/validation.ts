import { INVITE_CODE_PATTERN, USERNAME_PATTERN, normalizeInviteCode } from './api'

export const MIN_PASSWORD_LENGTH = 8

export type RegistrationValues = {
  email: string
  password: string
  passwordRepeat: string
  username: string
  inviteCode: string
  inviteRequired: boolean
}

export function validateRegistration(values: RegistrationValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (values.inviteRequired) {
    const code = normalizeInviteCode(values.inviteCode)
    const extra = [...new Set(code.replace(/[A-Z0-9-]/g, ''))]
    if (extra.length > 0) {
      errors.inviteCode = `Лишние символы в коде: ${extra.join(' ')}. Код пишется латиницей — проверьте раскладку клавиатуры`
    } else if (!INVITE_CODE_PATTERN.test(code)) {
      errors.inviteCode = 'Введите код приглашения'
    }
  }
  if (!USERNAME_PATTERN.test(values.username)) {
    errors.username = '3–24 символа: латинские буквы, цифры и «_»'
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = 'Введите корректный e-mail'
  if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = `Не короче ${MIN_PASSWORD_LENGTH} символов`
  if (values.password !== values.passwordRepeat) errors.passwordRepeat = 'Пароли не совпадают'
  return errors
}
