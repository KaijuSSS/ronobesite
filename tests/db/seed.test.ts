// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestDb, superuser, user } from './harness'

let db: TestDb
let adminId: string
let readerId: string

beforeAll(async () => {
  db = await TestDb.create()
  await db.createInvite('BOOT-ADMIN', 'admin')
  await db.createInvite('READER-01')
  adminId = await db.signUp('admin@example.com', 'owner', 'BOOT-ADMIN')
  readerId = await db.signUp('reader@example.com', 'reader', 'READER-01')
  await db.pg.exec(readFileSync(path.resolve(import.meta.dirname, '../../supabase/seed.sql'), 'utf8'))
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('демо-данные', () => {
  it('читатель видит только опубликованные книги и главы', async () => {
    const books = await db.query<{ title: string; chapters_count: number }>(
      user(readerId),
      `select title, chapters_count from public.books order by title`,
    )
    expect(books).toEqual([
      { title: 'Кофейня на изнанке города', chapters_count: 2 },
      { title: 'Хранитель последнего маяка', chapters_count: 3 },
    ])
    const chapters = await db.query(user(readerId), `select id from public.chapters`)
    expect(chapters).toHaveLength(5)
  })

  it('автор видит черновики, модератор — очередь заявок', async () => {
    const own = await db.query(user(adminId), `select id from public.books`)
    expect(own).toHaveLength(4)
    const queue = await db.query<{ kind: string }>(
      user(adminId),
      `select kind from public.moderation_queue where status = 'pending' order by kind`,
    )
    expect(queue.map((q) => q.kind)).toEqual(['book', 'chapter_revision'])
  })

  it('ожидающую главу можно одобрить штатной функцией', async () => {
    const item = await db.one<{ id: string }>(
      superuser,
      `select id from public.moderation_queue where kind = 'chapter_revision' and status = 'pending'`,
    )
    await db.query(user(adminId), `select public.approve_submission($1, null)`, [item.id])
    const book = await db.one<{ chapters_count: number }>(
      user(readerId),
      `select chapters_count from public.books where title = 'Кофейня на изнанке города'`,
    )
    expect(book.chapters_count).toBe(3)
  })

  it('повторный запуск не дублирует данные', async () => {
    await db.pg.exec(readFileSync(path.resolve(import.meta.dirname, '../../supabase/seed.sql'), 'utf8'))
    const all = await db.query(superuser, `select id from public.books`)
    expect(all).toHaveLength(4)
  })
})
