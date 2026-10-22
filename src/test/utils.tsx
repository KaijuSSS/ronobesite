import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import type { Session } from '@supabase/supabase-js'
import { useAuthStore } from '@/features/auth/store'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

type RenderOptions = {
  route?: string
  path?: string
  routes?: RouteObject[]
  queryClient?: QueryClient
}

/** Рендер компонента внутри роутера и QueryClient. */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const routes: RouteObject[] = [
    { path: options.path ?? '/', element: ui },
    { path: '/login', element: <div>Страница входа</div> },
    ...(options.routes ?? []),
  ]
  const router = createMemoryRouter(routes, { initialEntries: [options.route ?? '/'] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router, queryClient }
}

export function setSignedIn(userId = 'user-1') {
  useAuthStore.setState({
    initializing: false,
    session: { user: { id: userId, email: 'reader@example.com' } } as unknown as Session,
  })
}

export function setSignedOut() {
  useAuthStore.setState({ initializing: false, session: null, passwordRecovery: false })
}
