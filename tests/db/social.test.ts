// @vitest-environment node
//
// Лайки, прочтения, подписки и уведомления (миграция social).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestDb, anon, sampleDoc, superuser, user } from './harness'

let db: TestDb
let adminId: string
let authorId: string
let readerId: string
let bookId: string
let bookSlug: string
let chapterId: string
let draftChapterId: string

type Row = Record<string, unknown>

async function notificationsOf(userId: string, type: string) {
  return db.query<{ title: string; body: string; link: string }>(
    user(userId),
    `select title, body, link from public.notifications where type = $1 order by created_at`,
    [type],
  )
}

async function approvePending(filter: string, params: unknown[]) {
  const queue = await db.one<{ id: string }>(
    superuser,
    `select id from public.moderation_queue where status = 'pending' and ${filter}`,
    params,
  )
  await db.query(user(adminId), `select public.approve_submission($1, null)`, [queue.id])
}

beforeAll(async () => {
  db = await TestDb.create()
  await db.createInvite('BOOT-ADMIN', 'admin')
  await db.createInvite('TEAM-0001', 'reader', 5)
  adminId = await db.signUp('admin@example.com', 'admin_user', 'BOOT-ADMIN')
  authorId = await db.signUp('author@example.com', 'author', 'TEAM-0001')
  readerId = await db.signUp('reader@example.com', 'reader', 'TEAM-0001')

  const genre = await db.one<{ id: string }>(superuser, `select id from public.genres order by sort_order limit 1`)
  const book = await db.one<{ id: string; slug: string }>(
    user(authorId),
    `insert into public.books (title, description) values ('Очередной дворянин', $1) returning id, slug`,
    ['Описание произведения длиной больше двадцати символов.'],
  )
  bookId = book.id
  bookSlug = book.slug
  await db.query(user(authorId), `select public.set_book_genres($1, $2)`, [bookId, [genre.id]])

  const chapter = await db.one<{ id: string }>(user(authorId), `select (public.create_chapter($1, 1, 'Дом маркиза')).id`, [
    bookId,
  ])
  chapterId = chapter.id
  await db.query(user(authorId), `update public.chapter_revisions set content = $1 where chapter_id = $2`, [
    JSON.stringify(sampleDoc('Текст первой главы')),
    chapterId,
  ])
  const draft = await db.one<{ id: string }>(user(authorId), `select (public.create_chapter($1, 2, 'Черновик')).id`, [bookId])
  draftChapterId = draft.id
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('подписки на авторов', () => {
  it('читатель подписывается, автор получает уведомление', async () => {
    const info = await db.one<{ r: Row }>(user(readerId), `select public.toggle_follow($1) as r`, [authorId])
    expect(info.r).toEqual({ followers: 1, following: true })
    const notes = await notificationsOf(authorId, 'new_follower')
    expect(notes).toHaveLength(1)
    expect(notes[0].link).toBe('/profile/reader')
  })

  it('на себя подписаться нельзя, таблица недоступна напрямую', async () => {
    await expect(db.query(user(authorId), `select public.toggle_follow($1)`, [authorId])).rejects.toThrow(/самого себя/)
    await expect(db.query(user(readerId), `select * from public.author_follows`)).rejects.toThrow(/permission denied/)
    await expect(
      db.query(user(readerId), `insert into public.author_follows (follower_id, author_id) values ($1, $2)`, [adminId, authorId]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query(anon, `select public.toggle_follow($1)`, [authorId])).rejects.toThrow(/permission denied/)
    await expect(
      db.query(user(readerId), `select public.notify_followers($1, 'x', 'x', 'x', null)`, [authorId]),
    ).rejects.toThrow(/permission denied/)
  })

  it('отписка и повторная подписка', async () => {
    const off = await db.one<{ r: Row }>(user(readerId), `select public.toggle_follow($1) as r`, [authorId])
    expect(off.r).toEqual({ followers: 0, following: false })
    const on = await db.one<{ r: Row }>(user(readerId), `select public.toggle_follow($1) as r`, [authorId])
    expect(on.r).toEqual({ followers: 1, following: true })
  })

  it('подписчики узнают о новом произведении и новой главе', async () => {
    await db.query(user(authorId), `select public.submit_book($1)`, [bookId])
    const revision = await db.one<{ id: string }>(superuser, `select id from public.chapter_revisions where chapter_id = $1`, [
      chapterId,
    ])
    await db.query(user(authorId), `select public.submit_chapter_revision($1)`, [revision.id])

    await approvePending(`book_id = $1 and kind = 'book'`, [bookId])
    const books = await notificationsOf(readerId, 'followed_new_book')
    expect(books).toHaveLength(1)
    expect(books[0].link).toBe(`/book/${bookSlug}`)

    await approvePending(`chapter_revision_id = $1`, [revision.id])
    const chapters = await notificationsOf(readerId, 'followed_new_chapter')
    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toMatchObject({ body: 'Глава 1: Дом маркиза', link: `/book/${bookSlug}/chapter/${chapterId}` })

    // Сам автор о своих публикациях как подписчик не уведомляется.
    expect(await notificationsOf(authorId, 'followed_new_chapter')).toHaveLength(0)
  })
})

describe('лайки глав', () => {
  it('лайк ставится и снимается', async () => {
    const liked = await db.one<{ r: Row }>(user(readerId), `select public.toggle_chapter_like($1) as r`, [chapterId])
    expect(liked.r).toEqual({ count: 1, liked: true })
    const other = await db.one<{ r: Row }>(user(adminId), `select public.chapter_like_info($1) as r`, [chapterId])
    expect(other.r).toEqual({ count: 1, liked: false })
    const unliked = await db.one<{ r: Row }>(user(readerId), `select public.toggle_chapter_like($1) as r`, [chapterId])
    expect(unliked.r).toEqual({ count: 0, liked: false })
    await db.query(user(readerId), `select public.toggle_chapter_like($1)`, [chapterId])
  })

  it('неопубликованную главу лайкнуть нельзя и её счётчик скрыт', async () => {
    await expect(db.query(user(authorId), `select public.toggle_chapter_like($1)`, [draftChapterId])).rejects.toThrow(
      /опубликованную/,
    )
    await expect(db.query(user(readerId), `select public.chapter_like_info($1)`, [draftChapterId])).rejects.toThrow(
      /не найдена/,
    )
  })

  it('лайки нельзя подделать напрямую, гость закрытого сайта их не видит', async () => {
    await expect(
      db.query(user(readerId), `insert into public.chapter_likes (user_id, chapter_id) values ($1, $2)`, [adminId, chapterId]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query(anon, `select public.chapter_like_info($1)`, [chapterId])).rejects.toThrow(/не найдена/)
  })
})

describe('прочтения', () => {
  it('учитывается один раз на читателя, автор не считается', async () => {
    await db.query(user(readerId), `select public.mark_chapter_read($1)`, [chapterId])
    await db.query(user(readerId), `select public.mark_chapter_read($1)`, [chapterId])
    await db.query(user(authorId), `select public.mark_chapter_read($1)`, [chapterId])
    await db.query(user(readerId), `select public.mark_chapter_read($1)`, [draftChapterId])

    const stats = await db.query<{ chapter_id: string; likes: number; reads: number }>(
      user(authorId),
      `select * from public.book_chapter_stats($1) order by reads desc`,
      [bookId],
    )
    expect(stats.find((s) => s.chapter_id === chapterId)).toMatchObject({ likes: 1, reads: 1 })
    expect(stats.find((s) => s.chapter_id === draftChapterId)).toMatchObject({ likes: 0, reads: 0 })
  })

  it('статистику видит только автор и модераторы', async () => {
    await expect(db.query(user(readerId), `select * from public.book_chapter_stats($1)`, [bookId])).rejects.toThrow(
      /недоступно/,
    )
    expect(await db.query(user(adminId), `select * from public.book_chapter_stats($1)`, [bookId])).toHaveLength(2)
    await expect(db.query(user(readerId), `select * from public.chapter_reads`)).rejects.toThrow(/permission denied/)
  })
})

describe('уведомления о комментариях', () => {
  it('автор узнаёт о комментарии к главе, читатель — об ответе', async () => {
    const comment = await db.one<{ id: string }>(
      user(readerId),
      `insert into public.comments (book_id, chapter_id, body) values ($1, $2, 'Отличная глава!') returning id`,
      [bookId, chapterId],
    )
    const forAuthor = await notificationsOf(authorId, 'comment')
    expect(forAuthor).toHaveLength(1)
    expect(forAuthor[0].body).toContain('Глава 1: Дом маркиза')
    expect(forAuthor[0].body).toContain('Отличная глава!')
    expect(forAuthor[0].link).toBe(`/book/${bookSlug}/chapter/${chapterId}`)

    await db.query(user(authorId), `insert into public.comments (book_id, chapter_id, parent_id, body) values ($1, $2, $3, 'Спасибо!')`, [
      bookId,
      chapterId,
      comment.id,
    ])
    const replies = await notificationsOf(readerId, 'comment_reply')
    expect(replies).toHaveLength(1)
    expect(replies[0].body).toContain('Спасибо!')
    // Свой комментарий автору не приходит.
    expect(await notificationsOf(authorId, 'comment')).toHaveLength(1)
  })

  it('комментарий к произведению ведёт на страницу книги', async () => {
    await db.query(user(readerId), `insert into public.comments (book_id, body) values ($1, 'Жду продолжения')`, [bookId])
    const notes = await notificationsOf(authorId, 'comment')
    expect(notes.at(-1)?.link).toBe(`/book/${bookSlug}`)
  })
})

describe('изображения в главах', () => {
  it('загружать можно только в свою папку chapters', async () => {
    await db.query(user(authorId), `insert into storage.objects (bucket_id, name) values ('media', $1)`, [
      `chapters/${authorId}/a.webp`,
    ])
    await expect(
      db.query(user(authorId), `insert into storage.objects (bucket_id, name) values ('media', $1)`, [`chapters/${readerId}/b.webp`]),
    ).rejects.toThrow(/row-level security/)
    await expect(
      db.query(user(authorId), `insert into storage.objects (bucket_id, name) values ('media', $1)`, [`other/${authorId}/c.webp`]),
    ).rejects.toThrow(/row-level security/)
  })
})
