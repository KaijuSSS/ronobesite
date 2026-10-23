// @vitest-environment node
//
// Блокировка участников, правка и удаление глав модератором.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestDb, sampleDoc, superuser, user } from './harness'

let db: TestDb
let adminId: string
let moderatorId: string
let authorId: string
let readerId: string
let bookId: string
let chapterId: string

type Row = Record<string, unknown>

async function publishedText(asUser: string, id: string) {
  const row = await db.one<{ title: string; content: Row }>(
    user(asUser),
    `select r.title, r.content from public.chapters c join public.chapter_revisions r on r.id = c.published_revision_id where c.id = $1`,
    [id],
  )
  return { title: row.title, text: JSON.stringify(row.content) }
}

async function createPublishedChapter(number: number, text: string) {
  const chapter = await db.one<{ id: string }>(user(authorId), `select (public.create_chapter($1, $2, $3)).id`, [
    bookId,
    number,
    `Глава ${number}`,
  ])
  const revision = await db.one<{ id: string }>(superuser, `select id from public.chapter_revisions where chapter_id = $1`, [
    chapter.id,
  ])
  await db.query(user(authorId), `update public.chapter_revisions set content = $1 where id = $2`, [
    JSON.stringify(sampleDoc(text)),
    revision.id,
  ])
  await db.query(user(authorId), `select public.submit_chapter_revision($1)`, [revision.id])
  const queue = await db.one<{ id: string }>(
    superuser,
    `select id from public.moderation_queue where status = 'pending' and chapter_revision_id = $1`,
    [revision.id],
  )
  await db.query(user(adminId), `select public.approve_submission($1, null)`, [queue.id])
  return chapter.id
}

beforeAll(async () => {
  db = await TestDb.create()
  await db.createInvite('BOOT-ADMIN', 'admin')
  await db.createInvite('MODS-0001', 'moderator')
  await db.createInvite('AUTH-0001', 'author')
  await db.createInvite('TEAM-0001', 'reader', 5)
  adminId = await db.signUp('admin@example.com', 'admin_user', 'BOOT-ADMIN')
  moderatorId = await db.signUp('mod@example.com', 'moderator', 'MODS-0001')
  authorId = await db.signUp('author@example.com', 'author', 'AUTH-0001')
  readerId = await db.signUp('reader@example.com', 'reader', 'TEAM-0001')

  const genre = await db.one<{ id: string }>(superuser, `select id from public.genres order by sort_order limit 1`)
  const book = await db.one<{ id: string }>(
    user(authorId),
    `insert into public.books (title, description) values ('Хроники', $1) returning id`,
    ['Описание произведения длиной больше двадцати символов.'],
  )
  bookId = book.id
  await db.query(user(authorId), `select public.set_book_genres($1, $2)`, [bookId, [genre.id]])
  await db.query(user(authorId), `select public.submit_book($1)`, [bookId])
  const queue = await db.one<{ id: string }>(
    superuser,
    `select id from public.moderation_queue where status = 'pending' and book_id = $1`,
    [bookId],
  )
  await db.query(user(adminId), `select public.approve_submission($1, null)`, [queue.id])
  chapterId = await createPublishedChapter(1, 'Текст с опечаткой')
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('блокировка участников', () => {
  it('блокировать может только администратор и только с причиной', async () => {
    await expect(db.query(user(moderatorId), `select public.set_user_ban($1, true, 'Спам в комментариях')`, [readerId])).rejects.toThrow(
      /Недостаточно прав/,
    )
    await expect(db.query(user(adminId), `select public.set_user_ban($1, true, 'x')`, [readerId])).rejects.toThrow(/причину/)
    await expect(db.query(user(adminId), `select public.set_user_ban($1, true, 'Самоблокировка')`, [adminId])).rejects.toThrow(
      /самого себя/,
    )
  })

  it('администратора нельзя заблокировать, пока у него есть роль', async () => {
    const other = await db.signUp('admin2@example.com', 'second_admin', 'TEAM-0001')
    await db.query(user(adminId), `select public.set_user_role($1, 'admin', true)`, [other])
    await expect(db.query(user(adminId), `select public.set_user_ban($1, true, 'Нарушение правил')`, [other])).rejects.toThrow(
      /роль администратора/,
    )
  })

  it('заблокированный не видит каталог и ничего не может писать', async () => {
    await db.query(user(readerId), `insert into public.comments (book_id, body) values ($1, 'До блокировки')`, [bookId])
    await db.query(user(adminId), `select public.set_user_ban($1, true, 'Оскорбления в комментариях')`, [readerId])

    const ban = await db.one<{ r: Row }>(user(readerId), `select public.my_ban() as r`)
    expect(ban.r).toMatchObject({ reason: 'Оскорбления в комментариях' })

    expect(await db.query(user(readerId), `select id from public.books`)).toHaveLength(0)
    expect(await db.query(user(readerId), `select id from public.chapters`)).toHaveLength(0)
    await expect(
      db.query(user(readerId), `insert into public.comments (book_id, body) values ($1, 'После блокировки')`, [bookId]),
    ).rejects.toThrow(/row-level security/)
    await expect(db.query(user(readerId), `select public.toggle_chapter_like($1)`, [chapterId])).rejects.toThrow(/заблокирован/)
    await expect(db.query(user(readerId), `select public.toggle_follow($1)`, [authorId])).rejects.toThrow(/заблокирован/)
    const updated = await db.query(user(readerId), `update public.profiles set bio = 'x' where id = $1 returning id`, [readerId])
    expect(updated).toHaveLength(0)
  })

  it('причины блокировок видит только администратор', async () => {
    expect(await db.query(user(moderatorId), `select * from public.user_bans`)).toHaveLength(0)
    expect(await db.query(user(adminId), `select * from public.user_bans`)).toHaveLength(1)
    expect(await db.one<{ r: Row | null }>(user(moderatorId), `select public.my_ban() as r`)).toEqual({ r: null })
  })

  it('заблокированный автор не может публиковать', async () => {
    await db.query(user(adminId), `select public.set_user_ban($1, true, 'Плагиат в главах')`, [authorId])
    await expect(db.query(user(authorId), `select public.create_chapter($1, 9, 'x')`, [bookId])).rejects.toThrow(/заблокирован/)
    await expect(db.query(user(authorId), `insert into public.books (title) values ('Новая')`)).rejects.toThrow(/row-level security/)
    await db.query(user(adminId), `select public.set_user_ban($1, false)`, [authorId])
  })

  it('после разблокировки доступ возвращается', async () => {
    await db.query(user(adminId), `select public.set_user_ban($1, false)`, [readerId])
    expect(await db.query(user(readerId), `select id from public.books`)).toHaveLength(1)
    await db.query(user(readerId), `insert into public.comments (book_id, body) values ($1, 'Снова здесь')`, [bookId])
  })
})

describe('правка глав модератором', () => {
  it('исправленный текст сразу виден читателям, автор получает уведомление', async () => {
    await db.query(user(moderatorId), `select public.staff_edit_chapter($1, 'Глава 1', $2, 'Исправлены опечатки')`, [
      chapterId,
      JSON.stringify(sampleDoc('Текст без опечаток')),
    ])
    const after = await publishedText(readerId, chapterId)
    expect(after.text).toContain('Текст без опечаток')

    const states = await db.query<{ state: string }>(
      superuser,
      `select state from public.chapter_revisions where chapter_id = $1 order by created_at`,
      [chapterId],
    )
    expect(states.map((s) => s.state)).toEqual(['superseded', 'approved'])

    const notes = await db.query<{ body: string }>(
      user(authorId),
      `select body from public.notifications where type = 'chapter_edited'`,
    )
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toContain('Исправлены опечатки')
  })

  it('читатель и автор не могут пользоваться правкой модератора', async () => {
    await expect(
      db.query(user(readerId), `select public.staff_edit_chapter($1, 'x', $2)`, [chapterId, JSON.stringify(sampleDoc('взлом'))]),
    ).rejects.toThrow(/Недостаточно прав/)
    await expect(
      db.query(user(authorId), `select public.staff_edit_chapter($1, 'x', $2)`, [chapterId, JSON.stringify(sampleDoc('обход'))]),
    ).rejects.toThrow(/Недостаточно прав/)
  })

  it('пустую главу и неопубликованный черновик исправить нельзя', async () => {
    await expect(
      db.query(user(moderatorId), `select public.staff_edit_chapter($1, 'Глава 1', $2)`, [chapterId, JSON.stringify(sampleDoc(' '))]),
    ).rejects.toThrow(/пустой/)
    const draft = await db.one<{ id: string }>(user(authorId), `select (public.create_chapter($1, 5, 'Черновик')).id`, [bookId])
    await expect(
      db.query(user(moderatorId), `select public.staff_edit_chapter($1, 'x', $2)`, [draft.id, JSON.stringify(sampleDoc('текст'))]),
    ).rejects.toThrow(/только опубликованную/)
  })
})

describe('удаление глав модератором', () => {
  it('нужна причина, автор получает уведомление, счётчики пересчитываются', async () => {
    const second = await createPublishedChapter(2, 'Вторая глава')
    let book = await db.one<{ chapters_count: number }>(superuser, `select chapters_count from public.books where id = $1`, [bookId])
    expect(book.chapters_count).toBe(2)

    await expect(db.query(user(moderatorId), `select public.staff_delete_chapter($1, 'нет')`, [second])).rejects.toThrow(/причину/)
    await expect(db.query(user(readerId), `select public.staff_delete_chapter($1, 'Просто так')`, [second])).rejects.toThrow(
      /Недостаточно прав/,
    )
    await db.query(user(moderatorId), `select public.staff_delete_chapter($1, 'Нарушение правил сайта')`, [second])

    expect(await db.query(superuser, `select id from public.chapters where id = $1`, [second])).toHaveLength(0)
    book = await db.one<{ chapters_count: number }>(superuser, `select chapters_count from public.books where id = $1`, [bookId])
    expect(book.chapters_count).toBe(1)

    const notes = await db.query<{ body: string }>(
      user(authorId),
      `select body from public.notifications where type = 'chapter_deleted'`,
    )
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toContain('Нарушение правил сайта')
  })
})
