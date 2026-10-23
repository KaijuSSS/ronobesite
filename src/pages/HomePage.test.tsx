import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BookListResult } from '@/features/books/api'
import { renderWithProviders, setSignedIn, setSignedOut } from '@/test/utils'
import HomePage from './HomePage'

const me = vi.hoisted(() => ({ roles: ['reader'] as string[] }))

vi.mock('@/features/auth/api', () => ({
  fetchPublicConfig: () => Promise.resolve({ registration_mode: 'invite', catalog_access: 'members' }),
  fetchCurrentUser: () =>
    Promise.resolve({ profile: { id: 'user-1', username: 'reader', display_name: 'Читатель' }, roles: me.roles }),
}))

const empty: BookListResult = { items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 }
vi.mock('@/features/books/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/books/api')>()),
  listBooks: () => Promise.resolve(empty),
  fetchGenres: () => Promise.resolve([]),
}))

vi.mock('@/features/library/api', () => ({
  fetchReadingHistory: () => Promise.resolve([]),
}))

describe('главная страница', () => {
  it('гостю закрытого сайта показывает приглашение войти, а не каталог', async () => {
    setSignedOut()
    renderWithProviders(<HomePage />)
    expect(await screen.findByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'У меня есть приглашение' })).toHaveAttribute('href', '/register')
    expect(screen.queryByText('Популярное')).not.toBeInTheDocument()
  })

  it('участнику с пустым каталогом показывает понятное пустое состояние', async () => {
    me.roles = ['reader']
    setSignedIn()
    renderWithProviders(<HomePage />)
    expect(await screen.findByText('Каталог пока пуст')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Создать произведение/ })).not.toBeInTheDocument()
  })

  it('автору предлагает создать первое произведение', async () => {
    me.roles = ['reader', 'author']
    setSignedIn()
    renderWithProviders(<HomePage />)
    expect(await screen.findByRole('link', { name: /Создать произведение/ })).toHaveAttribute('href', '/studio/new')
  })
})
