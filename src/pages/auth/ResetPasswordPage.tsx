import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError, FormField } from '@/components/common/FormField'
import { EmptyState } from '@/components/common/EmptyState'
import { PageLoader } from '@/components/common/PageLoader'
import { AuthCard } from '@/features/auth/AuthLayout'
import { updatePassword } from '@/features/auth/api'
import { useAuth } from '@/features/auth/hooks'
import { useAuthStore } from '@/features/auth/store'
import { getErrorMessage } from '@/lib/errors'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Новый пароль после перехода по ссылке из письма. */
export default function ResetPasswordPage() {
  useDocumentTitle('Новый пароль')
  const { isAuthenticated, isLoading } = useAuth()
  const setPasswordRecovery = useAuthStore((s) => s.setPasswordRecovery)
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) return setError('Пароль должен быть не короче 8 символов')
    if (password !== repeat) return setError('Пароли не совпадают')
    setPending(true)
    setError(null)
    try {
      await updatePassword(password)
      setPasswordRecovery(false)
      toast.success('Пароль изменён')
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  if (isLoading) return <PageLoader />

  if (!isAuthenticated) {
    return (
      <AuthCard title="Ссылка недействительна">
        <EmptyState
          icon={KeyRound}
          title="Не удалось подтвердить ссылку"
          description="Ссылка устарела, уже использована или открыта в другом браузере. Запросите новое письмо."
          compact
          action={
            <Button asChild>
              <Link to="/forgot-password">Запросить снова</Link>
            </Button>
          }
        />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Новый пароль" description="Придумайте новый пароль для входа.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={error} />
        <FormField label="Новый пароль" hint="Не короче 8 символов">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Повторите пароль">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              required
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Сохранить пароль
        </Button>
      </form>
    </AuthCard>
  )
}
