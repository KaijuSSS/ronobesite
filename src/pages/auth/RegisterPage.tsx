import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError, FormField } from '@/components/common/FormField'
import { EmptyState } from '@/components/common/EmptyState'
import { AuthCard } from '@/features/auth/AuthLayout'
import { signUp } from '@/features/auth/api'
import { usePublicConfig } from '@/features/auth/hooks'
import { MIN_PASSWORD_LENGTH as MIN_PASSWORD, validateRegistration } from '@/features/auth/validation'
import { getErrorMessage } from '@/lib/errors'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function RegisterPage() {
  useDocumentTitle('Регистрация')
  const [searchParams] = useSearchParams()
  const config = usePublicConfig()
  const inviteRequired = config.data?.registration_mode !== 'open'

  const [values, setValues] = useState({
    inviteCode: searchParams.get('invite') ?? '',
    username: '',
    displayName: '',
    email: '',
    password: '',
    passwordRepeat: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateRegistration({ ...values, inviteRequired })
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      const result = await signUp({
        email: values.email.trim(),
        password: values.password,
        username: values.username.trim(),
        displayName: values.displayName,
        inviteCode: values.inviteCode,
      })
      if (result.needsEmailConfirmation) setSentTo(values.email.trim())
      // Иначе сессия уже создана — RedirectIfAuthenticated отправит на главную.
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Подтвердите e-mail">
        <EmptyState
          icon={MailCheck}
          title="Проверьте почту"
          description={
            <>
              Мы отправили письмо на <b className="text-foreground">{sentTo}</b>. Перейдите по ссылке из письма, чтобы
              завершить регистрацию. Откройте ссылку в этом же браузере.
            </>
          }
          compact
          action={
            <Button asChild variant="secondary">
              <Link to="/login">Ко входу</Link>
            </Button>
          }
        />
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Регистрация"
      description={
        inviteRequired
          ? 'Сайт закрыт: для регистрации нужен код приглашения от администратора.'
          : 'Создайте аккаунт, чтобы читать и публиковать.'
      }
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormError message={formError} />
        {inviteRequired ? (
          <FormField label="Код приглашения" error={errors.inviteCode}>
            {(props) => (
              <Input
                {...props}
                value={values.inviteCode}
                onChange={set('inviteCode')}
                autoComplete="off"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="font-mono tracking-wider uppercase"
                required
              />
            )}
          </FormField>
        ) : null}
        <FormField label="Имя пользователя" hint="Будет в адресе профиля. Латиница, цифры и «_»." error={errors.username}>
          {(props) => (
            <Input
              {...props}
              value={values.username}
              onChange={set('username')}
              autoComplete="username"
              maxLength={24}
              required
            />
          )}
        </FormField>
        <FormField label="Отображаемое имя" hint="Необязательно. Можно на русском." error={errors.displayName}>
          {(props) => <Input {...props} value={values.displayName} onChange={set('displayName')} maxLength={48} />}
        </FormField>
        <FormField label="E-mail" error={errors.email}>
          {(props) => (
            <Input {...props} type="email" value={values.email} onChange={set('email')} autoComplete="email" required />
          )}
        </FormField>
        <FormField label="Пароль" hint={`Не короче ${MIN_PASSWORD} символов`} error={errors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={values.password}
              onChange={set('password')}
              autoComplete="new-password"
              required
            />
          )}
        </FormField>
        <FormField label="Повторите пароль" error={errors.passwordRepeat}>
          {(props) => (
            <Input
              {...props}
              type="password"
              value={values.passwordRepeat}
              onChange={set('passwordRepeat')}
              autoComplete="new-password"
              required
            />
          )}
        </FormField>
        <Button type="submit" className="bg-brand-gradient w-full border-0 text-white" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Зарегистрироваться
        </Button>
      </form>
    </AuthCard>
  )
}
