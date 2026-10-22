import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookListParams, BookListResult, BookSummary } from '@/features/books/api'
import { renderWithProviders, setSignedIn } from '@/test/utils'
import type { GenreRow } from '@/types/database'
import CatalogPage from './CatalogPage'

const genres: GenreRow[] = [
  { id: 'g1', slug: 'fantasy', name: 'Фэнтези', sort_order: 1 },
  { id: 'g2', slug: 'romance', name: 'Романтика', sort_order: 2 },
]

function makeBook(id: string, title: string): BookSummary {
  return {
    id,
    slug: `book-${id}`,
    author_id: 'a1',
    title,
    description: '',
    cover_path: null,
    status: 'ongoing',
    is_adult: false,
    publication_state: 'published',
    rejection_reason: null,
    published_at: '2026-01-01T00:00:00Z',
    last_chapter_at: '2026-01-02T00:00:00Z',
    chapters_count: 3,
    rating_avg: 8.5,
    rating_count: 4,
    library_count: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    author: { id: 'a1', username: 'author', display_name: 'Автор', avatar_path: null },
    genres: [{ id: 'g1', slug: 'fantasy', name: 'Фэнтези' }],
    coverUrl: null,
  }
}

const listBooks = vi.fn<(params: BookListParams) => Promise<BookListResult>>()

vi.mock('@/features/books/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/books/api')>()),
  listBooks: (params: BookListParams) => listBooks(params),
  fetchGenres: () => Promise.resolve(genres),
}))

describe('каталог', () => {
  beforeEach(() => {
    setSignedIn()
    listBooks.mockReset()
  })

  it('показывает книги и количество результатов', async () => {
    listBooks.mockResolvedValue({
      items: [makeBook('1', 'Сад за туманом'), makeBook('2', 'Хранитель маяка')],
      total: 2,
      page: 1,
      pageSize: 24,
      totalPages: 1,
    })
    renderWithProviders(<CatalogPage />, { route: '/catalog', path: '/catalog' })

    expect(await screen.findByRole('heading', { name: 'Сад за туманом' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Хранитель маяка' })).toBeInTheDocument()
    expect(screen.getByText(/Найдено: 2 произведения/)).toBeInTheDocument()
  })

  it('передаёт параметры из адреса в запрос', async () => {
    listBooks.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 24, totalPages: 1 })
    renderWithProviders(<CatalogPage />, {
      route: '/catalog?q=маяк&genres=fantasy&status=completed&sort=rating&page=2',
      path: '/catalog',
    })
    await screen.findByText('Ничего не найдено')
    expect(listBooks).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: 'маяк',
        genreIds: ['g1'],
        statuses: ['completed'],
        sort: 'rating',
        page: 2,
      }),
    )
  })

  it('сохраняет фильтры в адресе', async () => {
    const user = userEvent.setup()
    listBooks.mockResolvedValue({ items: [makeBook('1', 'Сад за туманом')], total: 1, page: 1, pageSize: 24, totalPages: 1 })
    const { router } = renderWithProviders(<CatalogPage />, { route: '/catalog', path: '/catalog' })
    await screen.findByRole('heading', { name: 'Сад за туманом' })

    const filters = screen.getByRole('complementary', { name: 'Фильтры каталога' })
    await user.click(within(filters).getByRole('button', { name: 'Романтика' }))
    expect(router.state.location.search).toContain('genres=romance')

    await user.click(within(filters).getByRole('checkbox', { name: 'Завершено' }))
    expect(router.state.location.search).toContain('status=completed')
  })

  it('показывает ошибку API и позволяет повторить запрос', async () => {
    const user = userEvent.setup()
    listBooks.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    listBooks.mockResolvedValue({ items: [makeBook('1', 'Сад за туманом')], total: 1, page: 1, pageSize: 24, totalPages: 1 })
    renderWithProviders(<CatalogPage />, { route: '/catalog', path: '/catalog' })

    expect(await screen.findByText(/Нет соединения с сервером/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Повторить/ }))
    expect(await screen.findByRole('heading', { name: 'Сад за туманом' })).toBeInTheDocument()
  })
})
