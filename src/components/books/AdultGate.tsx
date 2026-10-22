import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'

const KEY = 'ranobesite:adult-confirmed'

function isConfirmed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Предупреждение перед произведениями 18+. */
export function AdultGate({ isAdult, children }: { isAdult: boolean; children: ReactNode }) {
  const [confirmed, setConfirmed] = useState(isConfirmed)
  if (!isAdult || confirmed) return <>{children}</>

  function confirm() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // без сохранения — спросим ещё раз в следующий раз
    }
    setConfirmed(true)
  }

  return (
    <EmptyState
      icon={ShieldAlert}
      title="Произведение для взрослых"
      description="Текст содержит сцены, не предназначенные для читателей младше 18 лет. Продолжая, вы подтверждаете, что вам исполнилось 18."
      action={
        <>
          <Button onClick={confirm}>Мне есть 18</Button>
          <Button asChild variant="secondary">
            <Link to="/catalog">Вернуться в каталог</Link>
          </Button>
        </>
      }
    />
  )
}
