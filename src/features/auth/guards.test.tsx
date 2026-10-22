import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders, setSignedIn, setSignedOut } from '@/test/utils'
import type { AppRole } from '@/types/database'
import { RequireAuth, RequireMember, RequireRole } from './guards'

const config = { registration_mode: 'invite' as const, catalog_access: 'members' as 'members' | 'public' }
let roles: AppRole[] = ['reader']

vi.mock('./api', () => ({
  fetchPublicConfig: () => Promise.resolve(config),
  fetchCurrentUser: () => Promise.resolve({ profile: { id: 'user-1', username: 'reader' }, roles }),
}))

describe('защита маршрутов', () => {
  beforeEach(() => {
    config.catalog_access = 'members'
    roles = ['reader']
  })

  it('гость перенаправляется на вход с адресом возврата', async () => {
    setSignedOut()
    const { router } = renderWithProviders(
      <RequireAuth>
        <p>Секретная библиотека</p>
      </RequireAuth>,
      { route: '/library', path: '/library' },
    )
    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
    expect(screen.queryByText('Секретная библиотека')).not.toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Flibrary')
  })

  it('закрытый каталог недоступен гостю', async () => {
    setSignedOut()
    renderWithProviders(
      <RequireMember>
        <p>Каталог</p>
      </RequireMember>,
      { route: '/catalog', path: '/catalog' },
    )
    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  })

  it('открытый каталог доступен гостю', async () => {
    setSignedOut()
    config.catalog_access = 'public'
    renderWithProviders(
      <RequireMember>
        <p>Каталог</p>
      </RequireMember>,
      { route: '/catalog', path: '/catalog' },
    )
    expect(await screen.findByText('Каталог')).toBeInTheDocument()
  })

  it('участник видит закрытые страницы', async () => {
    setSignedIn()
    renderWithProviders(
      <RequireAuth>
        <p>Секретная библиотека</p>
      </RequireAuth>,
    )
    expect(await screen.findByText('Секретная библиотека')).toBeInTheDocument()
  })

  it('читатель не попадает в модерацию', async () => {
    setSignedIn()
    renderWithProviders(
      <RequireRole roles={['moderator', 'admin']}>
        <p>Очередь модерации</p>
      </RequireRole>,
    )
    expect(await screen.findByText('Недостаточно прав')).toBeInTheDocument()
    expect(screen.queryByText('Очередь модерации')).not.toBeInTheDocument()
  })

  it('модератор попадает в модерацию', async () => {
    setSignedIn()
    roles = ['reader', 'moderator']
    renderWithProviders(
      <RequireRole roles={['moderator', 'admin']}>
        <p>Очередь модерации</p>
      </RequireRole>,
    )
    expect(await screen.findByText('Очередь модерации')).toBeInTheDocument()
  })
})
