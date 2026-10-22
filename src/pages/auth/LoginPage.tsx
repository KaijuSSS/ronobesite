import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError, FormField } from '@/components/common/FormField'
import { AuthCard } from '@/features/auth/AuthLayout'
import { resendConfirmation, signIn } from '@/features/auth/api'
import { getErrorMessage } from '@/lib/errors'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { toast } from 'sonner'

export default function LoginPage() {
  useDocumentTitle('Вход')
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setUnconfirmed(false)
    try {
      await signIn(email.trim(), password)
      // Перенаправление выполнит RedirectIfAuthenticated.
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      setUnconfirmed(/подтвержд/i.test(message))
    } finally {
      setPending(false)
    }
  }

  async function handleResend() {
    try {
      await resendConfirmation(email.trim())
      toast.success('Письмо отправлено повторно')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const redirect = searchParams.get('redirect')
  return (
    <AuthCard
      title="Вход"
      description={redirect ? 'Войдите, чтобы открыть эту страницу.' : 'С возвращением! Введите e-mail и пароль.'}
      footer={
        <>
          Нет аккаунта?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Регистрация по приглашению
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
        <FormError message={error} />
        {unconfirmed ? (
          <Button type="button" variant="secondary" className="w-full" onClick={() => void handleResend()}>
            Отправить письмо ещё раз
          </Button>
        ) : null}
        <FormField label="E-mail">
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Пароль">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
            Забыли пароль?
          </Link>
        </div>
        <Button type="submit" className="bg-brand-gradient w-full border-0 text-white" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Войти
        </Button>
      </form>
    </AuthCard>
  )
}
