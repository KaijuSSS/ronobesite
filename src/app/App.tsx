import { useState } from 'react'
import { RouterProvider } from 'react-router/dom'
import { SetupRequired } from '@/components/common/SetupRequired'
import { env } from '@/lib/env'
import { AppProviders, createQueryClient } from './providers'
import { createAppRouter } from './router'

export function App() {
  if (env.problem) return <SetupRequired problem={env.problem} />
  return <ConfiguredApp />
}

function ConfiguredApp() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(createAppRouter)
  return (
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
