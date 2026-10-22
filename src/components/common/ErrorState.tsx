import { CloudOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/errors'
import { EmptyState } from './EmptyState'

type ErrorStateProps = {
  error: unknown
  title?: string
  onRetry?: () => void
  compact?: boolean
}

export function ErrorState({ error, title = 'Не удалось загрузить данные', onRetry, compact }: ErrorStateProps) {
  return (
    <EmptyState
      icon={CloudOff}
      title={title}
      description={getErrorMessage(error)}
      compact={compact}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw /> Повторить
          </Button>
        ) : null
      }
    />
  )
}
