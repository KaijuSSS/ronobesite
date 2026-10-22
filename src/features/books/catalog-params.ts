import { WORK_STATUSES } from '@/lib/labels'
import type { WorkStatus } from '@/types/database'
import { BOOK_SORT_LABELS, type BookSort } from './api'

export type CatalogParams = {
  q: string
  genres: string[]
  statuses: WorkStatus[]
  sort: BookSort
  page: number
}

const SORTS = Object.keys(BOOK_SORT_LABELS) as BookSort[]

function list(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Разбор параметров каталога из адресной строки (с защитой от мусора). */
export function parseCatalogParams(search: URLSearchParams): CatalogParams {
  const sort = search.get('sort') as BookSort | null
  const page = Number.parseInt(search.get('page') ?? '1', 10)
  return {
    q: (search.get('q') ?? '').slice(0, 100),
    genres: list(search.get('genres')).filter((g) => /^[a-z0-9-]{2,40}$/.test(g)),
    statuses: list(search.get('status')).filter((s): s is WorkStatus => WORK_STATUSES.includes(s as WorkStatus)),
    sort: sort && SORTS.includes(sort) ? sort : 'updated',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  }
}

export function serializeCatalogParams(params: CatalogParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.q.trim()) search.set('q', params.q.trim())
  if (params.genres.length) search.set('genres', params.genres.join(','))
  if (params.statuses.length) search.set('status', params.statuses.join(','))
  if (params.sort !== 'updated') search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}
