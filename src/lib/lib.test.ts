import { describe, expect, it } from 'vitest'
import { parseCatalogParams, serializeCatalogParams } from '@/features/books/catalog-params'
import { normalizeInviteCode } from '@/features/auth/api'
import { validateRegistration } from '@/features/auth/validation'
import { validateBookForm } from '@/features/studio/validation'
import { AppError, getErrorMessage } from './errors'
import { formatCount, plural } from './format'
import { getPageItems } from './pagination'

describe('getErrorMessage', () => {
  it('переводит типовые ошибки', () => {
    expect(getErrorMessage({ message: 'Invalid login credentials' })).toBe('Неверный e-mail или пароль')
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Нет соединения/)
    expect(getErrorMessage({ code: '42501', message: 'permission denied for table books' })).toBe(
      'Недостаточно прав для этого действия',
    )
    expect(getErrorMessage({ code: '23505', message: 'duplicate key' })).toBe('Такая запись уже существует')
    expect(getErrorMessage({ code: 'P0001', message: 'Заявка уже обработана' })).toBe('Заявка уже обработана')
    expect(getErrorMessage(new AppError('Своё сообщение'))).toBe('Своё сообщение')
    expect(getErrorMessage({ message: 'something odd' })).toMatch(/Что-то пошло не так/)
  })

  it('не показывает технические детали на английском', () => {
    expect(getErrorMessage({ message: 'relation "x" does not exist' })).toMatch(/Что-то пошло не так/)
  })
})

describe('format', () => {
  it('склоняет слова', () => {
    expect(plural(1, ['глава', 'главы', 'глав'])).toBe('глава')
    expect(plural(3, ['глава', 'главы', 'глав'])).toBe('главы')
    expect(plural(11, ['глава', 'главы', 'глав'])).toBe('глав')
    expect(plural(21, ['глава', 'главы', 'глав'])).toBe('глава')
    expect(formatCount(5, ['глава', 'главы', 'глав'])).toBe('5 глав')
  })
})

describe('pagination', () => {
  it('строит список страниц с пропусками', () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(getPageItems(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
    expect(getPageItems(1, 12)).toEqual([1, 2, 'gap', 12])
  })
})

describe('параметры каталога', () => {
  it('разбирает и собирает адрес, отбрасывая мусор', () => {
    const params = parseCatalogParams(
      new URLSearchParams('q=маяк&genres=fantasy,<script>,romance&status=completed,bogus&sort=evil&page=-3'),
    )
    expect(params).toEqual({ q: 'маяк', genres: ['fantasy', 'romance'], statuses: ['completed'], sort: 'updated', page: 1 })
    expect(serializeCatalogParams({ ...params, page: 2, sort: 'rating' }).toString()).toBe(
      'q=%D0%BC%D0%B0%D1%8F%D0%BA&genres=fantasy%2Cromance&status=completed&sort=rating&page=2',
    )
  })
})

describe('валидация форм', () => {
  it('регистрация требует приглашение в закрытом режиме', () => {
    const base = {
      email: 'a@b.ru',
      password: 'password1',
      passwordRepeat: 'password1',
      username: 'reader_1',
      inviteCode: '',
    }
    expect(validateRegistration({ ...base, inviteRequired: true })).toHaveProperty('inviteCode')
    expect(validateRegistration({ ...base, inviteRequired: false })).toEqual({})
    expect(validateRegistration({ ...base, username: 'Иван', inviteRequired: false })).toHaveProperty('username')
    expect(validateRegistration({ ...base, passwordRepeat: 'other', inviteRequired: false })).toHaveProperty(
      'passwordRepeat',
    )
  })

  it('исправляет типовые ошибки в коде приглашения', () => {
    // Кириллические «к», «О», «е», пробелы, длинное тире, невидимый пробел.
    expect(normalizeInviteCode(' кОd​—tеst 12 ')).toBe('KOD-TEST12')
    expect(normalizeInviteCode('abcd_efgh')).toBe('ABCD-EFGH')
    expect(normalizeInviteCode('ＡＢＣ１２３')).toBe('ABC123')

    const base = {
      email: 'a@b.ru',
      password: 'password1',
      passwordRepeat: 'password1',
      username: 'reader_1',
      inviteRequired: true,
    }
    expect(validateRegistration({ ...base, inviteCode: 'кОd-tеst' })).toEqual({})
    // «Д» не похожа ни на одну латинскую букву — просим проверить раскладку.
    expect(validateRegistration({ ...base, inviteCode: 'КОД-ТЕСТ' }).inviteCode).toMatch(/Д/)
  })

  it('форма книги проверяет название и жанры', () => {
    const values = { title: ' ', description: '', status: 'ongoing' as const, is_adult: false, cover_path: null, genre_ids: [] }
    expect(validateBookForm(values)).toHaveProperty('title')
    expect(validateBookForm({ ...values, title: 'Книга', genre_ids: Array.from({ length: 9 }, (_, i) => `g${i}`) })).toHaveProperty(
      'genres',
    )
  })
})
