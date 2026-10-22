import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'

/** Ошибка рендера или загрузки страницы — вместо белого экрана. */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const isChunkError = error instanceof Error && /dynamically imported module|Failed to fetch|Loading chunk/i.test(error.message)

  if (error instanceof Error) console.error(error)

  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : isChunkError
      ? 'Похоже, сайт обновился. Перезагрузите страницу, чтобы получить свежую версию.'
      : 'Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.'

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <EmptyState
        icon={TriangleAlert}
        title="Что-то пошло не так"
        description={description}
        action={
          <>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw /> Перезагрузить
            </Button>
            <Button asChild variant="secondary">
              <Link to="/">На главную</Link>
            </Button>
          </>
        }
      />
    </main>
  )
}
