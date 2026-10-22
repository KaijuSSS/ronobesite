import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormError, FormField } from '@/components/common/FormField'
import { EmptyState } from '@/components/common/EmptyState'
import { AuthCard } from '@/features/auth/AuthLayout'
import { requestPasswordReset } from '@/features/auth/api'
import { getErrorMessage } from '@/lib/errors'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function ForgotPasswordPage() {
  useDocumentTitle('Восстановление пароля')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard
      title="Восстановление пароля"
      description={sent ? undefined : 'Укажите e-mail — пришлём ссылку для смены пароля.'}
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Вернуться ко входу
        </Link>
      }
    >
      {sent ? (
        <EmptyState
          icon={MailCheck}
          title="Письмо отправлено"
          description="Если аккаунт с таким адресом существует, в течение нескольких минут придёт письмо со ссылкой. Откройте её в этом же браузере."
          compact
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
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
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Отправить ссылку
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
