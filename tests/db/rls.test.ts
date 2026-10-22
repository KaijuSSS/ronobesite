// @vitest-environment node
//
// Интеграционные тесты правил доступа. Миграции применяются к настоящему
// PostgreSQL (PGlite), запросы выполняются от ролей anon/authenticated
// так же, как их выполняет PostgREST в Supabase.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TestDb, anon, sampleDoc, superuser, user } from './harness'

let db: TestDb
let adminId: string
let moderatorId: string
let authorId: string
let readerId: string
let genreIds: string[]

type Row = Record<string, unknown>

async function createDraftBook(ownerId: string, title = 'Тихий сад') {
  const book = await db.one<{ id: string; slug: string }>(
    user(ownerId),
    `insert into public.books (title, description) values ($1, $2) returning id, slug`,
    [title, 'Описание произведения длиной больше двадцати символов.'],
  )
  await db.query(user(ownerId), `select public.set_book_genres($1, $2)`, [book.id, genreIds.slice(0, 2)])
  return book
}

async function createChapter(ownerId: string, bookId: string, text: string, number = 1) {
  const chapter = await db.one<{ id: string }>(user(ownerId), `select (public.create_chapter($1, $2, $3)).id`, [
    bookId,
    number,
    `Глава ${number}`,
  ])
  const revision = await db.one<{ id: string }>(
    user(ownerId),
    `select id from public.chapter_revisions where chapter_id = $1`,
    [chapter.id],
  )
  await db.query(user(ownerId), `update public.chapter_revisions set content = $1 where id = $2`, [
    JSON.stringify(sampleDoc(text)),
    revision.id,
  ])
  return { chapterId: chapter.id, revisionId: revision.id }
}

async function pendingQueueId(filter: string, params: unknown[]) {
  const row = await db.one<{ id: string }>(
    superuser,
    `select id from public.moderation_queue where status = 'pending' and ${filter}`,
    params,
  )
  return row.id
}

beforeAll(async () => {
  db = await TestDb.create()
  await db.createInvite('BOOT-ADMIN', 'admin')
  await db.createInvite('MODS-0001', 'moderator')
  await db.createInvite('TEAM-0001', 'reader', 5)
  adminId = await db.signUp('admin@example.com', 'admin_user', 'boot-admin')
  moderatorId = await db.signUp('mod@example.com', 'moderator', 'MODS-0001')
  authorId = await db.signUp('author@example.com', 'author', 'TEAM-0001')
  readerId = await db.signUp('reader@example.com', 'reader', 'TEAM-0001')
  const genres = await db.query<{ id: string }>(superuser, `select id from public.genres order by sort_order`)
  genreIds = genres.map((g) => g.id)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('регистрация по приглашениям', () => {
  it('не создаёт пользователя без приглашения', async () => {
    await expect(db.signUp('stranger@example.com', 'stranger')).rejects.toThrow(/приглашению/)
    const rows = await db.query(superuser, `select 1 from auth.users where email = 'stranger@example.com'`)
    expect(rows).toHaveLength(0)
  })

  it('не принимает исчерпанное приглашение', async () => {
    await db.createInvite('ONCE-0001')
    await db.signUp('first@example.com', 'first_user', 'ONCE-0001')
    await expect(db.signUp('second@example.com', 'second_user', 'ONCE-0001')).rejects.toThrow(/приглашению/)
  })

  it('не принимает отозванное и просроченное приглашение', async () => {
    await db.query(superuser, `insert into public.invites (code, revoked_at) values ('REVOKED-1', now())`)
    await db.query(superuser, `insert into public.invites (code, expires_at) values ('EXPIRED-1', now() - interval '1 day')`)
    await expect(db.signUp('r@example.com', 'revoked_user', 'REVOKED-1')).rejects.toThrow()
    await expect(db.signUp('e@example.com', 'expired_user', 'EXPIRED-1')).rejects.toThrow()
  })

  it('учитывает привязку приглашения к e-mail', async () => {
    await db.query(superuser, `insert into public.invites (code, email) values ('MAIL-0001', 'guest@example.com')`)
    await expect(db.signUp('other@example.com', 'other_user', 'MAIL-0001')).rejects.toThrow()
    await expect(db.signUp('guest@example.com', 'guest_user', 'MAIL-0001')).resolves.toBeTruthy()
  })

  it('создаёт профиль и выдаёт роль из приглашения', async () => {
    const roles = await db.query<{ role: string }>(superuser, `select role from public.user_roles where user_id = $1 order by role`, [
      adminId,
    ])
    expect(roles.map((r) => r.role)).toEqual(['reader', 'admin'])
    const profile = await db.one<{ username: string }>(superuser, `select username from public.profiles where id = $1`, [readerId])
    expect(profile.username).toBe('reader')
  })

  it('check_signup не раскрывает имена без действующего приглашения', async () => {
    const res = await db.one<{ r: Row }>(anon, `select public.check_signup('WRONG-CODE', 'reader', 'x@example.com') as r`)
    expect(res.r).toMatchObject({ invite: 'invalid', username: 'unknown' })
    const ok = await db.one<{ r: Row }>(anon, `select public.check_signup('team-0001', 'reader', 'x@example.com') as r`)
    expect(ok.r).toMatchObject({ invite: 'ok', username: 'taken' })
  })

  it('в открытом режиме регистрация работает без приглашения', async () => {
    await db.query(superuser, `update public.app_settings set registration_mode = 'open'`)
    await expect(db.signUp('open@example.com', 'open_user')).resolves.toBeTruthy()
    await db.query(superuser, `update public.app_settings set registration_mode = 'invite'`)
  })
})

describe('роли и защищённые поля', () => {
  it('пользователь не может выдать себе роль', async () => {
    await expect(
      db.query(user(readerId), `insert into public.user_roles (user_id, role) values ($1, 'admin')`, [readerId]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query(user(readerId), `select public.set_user_role($1, 'admin', true)`, [readerId])).rejects.toThrow(
      /Недостаточно прав/,
    )
  })

  it('администратор может назначить модератора, но не может снять админство с себя', async () => {
    await db.query(user(adminId), `select public.set_user_role($1, 'moderator', true)`, [readerId])
    const roles = await db.query(superuser, `select 1 from public.user_roles where user_id = $1 and role = 'moderator'`, [readerId])
    expect(roles).toHaveLength(1)
    await db.query(user(adminId), `select public.set_user_role($1, 'moderator', false)`, [readerId])
    await expect(db.query(user(adminId), `select public.set_user_role($1, 'admin', false)`, [adminId])).rejects.toThrow(
      /самого себя/,
    )
  })

  it('пользователь не может менять служебные поля книги', async () => {
    const book = await createDraftBook(authorId, 'Защищённые поля')
    await expect(
      db.query(user(authorId), `update public.books set publication_state = 'published' where id = $1`, [book.id]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.query(user(authorId), `update public.books set rating_avg = 10 where id = $1`, [book.id]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.query(user(authorId), `insert into public.books (title, publication_state) values ('x', 'published')`),
    ).rejects.toThrow(/permission denied/)
  })

  it('нельзя создать книгу от имени другого пользователя', async () => {
    // author_id нельзя передать явно — столбец не входит в разрешённые
    await expect(
      db.query(user(authorId), `insert into public.books (title, author_id) values ('x', $1)`, [readerId]),
    ).rejects.toThrow(/permission denied/)
  })

  it('чужой черновик нельзя изменить или удалить', async () => {
    const book = await createDraftBook(authorId, 'Чужой черновик')
    const updated = await db.query(user(readerId), `update public.books set title = 'взлом' where id = $1 returning id`, [
      book.id,
    ])
    expect(updated).toHaveLength(0)
    const deleted = await db.query(user(readerId), `delete from public.books where id = $1 returning id`, [book.id])
    expect(deleted).toHaveLength(0)
    await expect(db.query(user(readerId), `select public.set_book_genres($1, '{}')`, [book.id])).rejects.toThrow(/недоступно/)
  })

  it('гость не может вызывать функции автора и модератора', async () => {
    await expect(db.query(anon, `select public.submit_book(gen_random_uuid())`)).rejects.toThrow(/permission denied/)
    await expect(db.query(anon, `select public.approve_submission(gen_random_uuid(), null)`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('служебные функции недоступны клиенту напрямую', async () => {
    await expect(
      db.query(user(readerId), `select public.notify_user($1, 'x', 'x', 'x', null)`, [readerId]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query(user(readerId), `select public.refresh_book_stats(gen_random_uuid())`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('приглашения видит только администратор', async () => {
    expect(await db.query(user(readerId), `select * from public.invites`)).toHaveLength(0)
    expect((await db.query(user(adminId), `select * from public.invites`)).length).toBeGreaterThan(0)
    await expect(db.query(user(readerId), `select public.create_invite()`)).rejects.toThrow(/Недостаточно прав/)
    const invite = await db.one<{ code: string }>(user(adminId), `select (public.create_invite()).code`)
    expect(invite.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
  })

  it('e-mail пользователей не доступен через публичные таблицы', async () => {
    const cols = await db.query<{ column_name: string }>(
      superuser,
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'`,
    )
    expect(cols.map((c) => c.column_name)).not.toContain('email')
    await expect(db.query(user(readerId), `select * from public.admin_list_users()`)).rejects.toThrow(/Недостаточно прав/)
    const list = await db.query<{ email: string }>(user(adminId), `select * from public.admin_list_users()`)
    expect(list.some((u) => u.email === 'reader@example.com')).toBe(true)
  })
})

describe('публикация и модерация', () => {
  let bookId: string
  let chapterId: string
  let revisionId: string

  it('черновик виден только автору и модераторам', async () => {
    const book = await createDraftBook(authorId, 'Свет над рекой')
    bookId = book.id
    expect(book.slug).toMatch(/^svet-nad-rekoy-[0-9a-f]{6}$/)

    expect(await db.query(user(readerId), `select id from public.books where id = $1`, [bookId])).toHaveLength(0)
    expect(await db.query(user(authorId), `select id from public.books where id = $1`, [bookId])).toHaveLength(1)
    expect(await db.query(user(moderatorId), `select id from public.books where id = $1`, [bookId])).toHaveLength(1)
  })

  it('глава до одобрения не видна читателю', async () => {
    const created = await createChapter(authorId, bookId, 'Первая версия текста главы')
    chapterId = created.chapterId
    revisionId = created.revisionId
    const rev = await db.one<{ word_count: number }>(superuser, `select word_count from public.chapter_revisions where id = $1`, [
      revisionId,
    ])
    expect(rev.word_count).toBe(4)
    expect(await db.query(user(readerId), `select id from public.chapters where id = $1`, [chapterId])).toHaveLength(0)
    expect(await db.query(user(readerId), `select id from public.chapter_revisions where id = $1`, [revisionId])).toHaveLength(0)
  })

  it('автор не может одобрить свою заявку', async () => {
    await db.query(user(authorId), `select public.submit_book($1)`, [bookId])
    await db.query(user(authorId), `select public.submit_chapter_revision($1)`, [revisionId])
    const queueId = await pendingQueueId(`book_id = $1 and kind = 'book'`, [bookId])

    await expect(db.query(user(authorId), `select public.approve_submission($1, null)`, [queueId])).rejects.toThrow(
      /Недостаточно прав/,
    )
    await expect(
      db.query(user(authorId), `update public.moderation_queue set status = 'approved' where id = $1`, [queueId]),
    ).rejects.toThrow(/permission denied/)
  })

  it('после отправки черновик нельзя менять напрямую', async () => {
    const updated = await db.query(user(authorId), `update public.books set title = 'Новое' where id = $1 returning id`, [
      bookId,
    ])
    expect(updated).toHaveLength(0)
    const revUpdated = await db.query(
      user(authorId),
      `update public.chapter_revisions set title = 'Другое' where id = $1 returning id`,
      [revisionId],
    )
    expect(revUpdated).toHaveLength(0)
  })

  it('отклонение требует причину', async () => {
    const queueId = await pendingQueueId(`book_id = $1 and kind = 'book'`, [bookId])
    await expect(db.query(user(moderatorId), `select public.reject_submission($1, '  ')`, [queueId])).rejects.toThrow(
      /причину/,
    )
  })

  it('модератор одобряет книгу и главу, повторная обработка запрещена', async () => {
    const bookQueue = await pendingQueueId(`book_id = $1 and kind = 'book'`, [bookId])
    const chapterQueue = await pendingQueueId(`chapter_revision_id = $1`, [revisionId])

    await db.query(user(moderatorId), `select public.approve_submission($1, 'ok')`, [bookQueue])
    await db.query(user(moderatorId), `select public.approve_submission($1, null)`, [chapterQueue])
    await expect(db.query(user(moderatorId), `select public.approve_submission($1, null)`, [bookQueue])).rejects.toThrow(
      /уже обработана/,
    )
    await expect(db.query(user(adminId), `select public.reject_submission($1, 'поздно отклонять')`, [chapterQueue])).rejects.toThrow(
      /уже обработана/,
    )

    const book = await db.one<{ publication_state: string; chapters_count: number }>(
      user(readerId),
      `select publication_state, chapters_count from public.books where id = $1`,
      [bookId],
    )
    expect(book).toMatchObject({ publication_state: 'published', chapters_count: 1 })

    const events = await db.query(user(moderatorId), `select action from public.moderation_events where queue_id = $1 order by created_at`, [
      bookQueue,
    ])
    expect(events.map((e) => e.action)).toEqual(['submitted', 'approved'])

    const notes = await db.query(user(authorId), `select type from public.notifications order by created_at`)
    expect(notes.map((n) => n.type)).toEqual(expect.arrayContaining(['book_approved', 'chapter_approved']))
    expect(await db.query(user(readerId), `select * from public.notifications where user_id = $1`, [authorId])).toHaveLength(0)
  })

  it('читатель видит опубликованную главу и её текст', async () => {
    const rows = await db.query<{ content: Row }>(
      user(readerId),
      `select r.content from public.chapters c join public.chapter_revisions r on r.id = c.published_revision_id where c.id = $1`,
      [chapterId],
    )
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0].content)).toContain('Первая версия')
  })

  it('правка опубликованной главы не заменяет текст до одобрения', async () => {
    const draft = await db.one<{ id: string }>(user(authorId), `select (public.start_chapter_revision($1)).id`, [chapterId])
    expect(draft.id).not.toBe(revisionId)
    await db.query(user(authorId), `update public.chapter_revisions set content = $1 where id = $2`, [
      JSON.stringify(sampleDoc('Исправленная версия текста')),
      draft.id,
    ])

    // Читатель не видит черновик новой версии
    expect(await db.query(user(readerId), `select id from public.chapter_revisions where id = $1`, [draft.id])).toHaveLength(0)

    await db.query(user(authorId), `select public.submit_chapter_revision($1)`, [draft.id])
    const queueId = await pendingQueueId(`chapter_revision_id = $1`, [draft.id])

    let content = await db.one<{ content: Row }>(
      user(readerId),
      `select r.content from public.chapters c join public.chapter_revisions r on r.id = c.published_revision_id where c.id = $1`,
      [chapterId],
    )
    expect(JSON.stringify(content.content)).toContain('Первая версия')

    await db.query(user(moderatorId), `select public.approve_submission($1, null)`, [queueId])

    content = await db.one<{ content: Row }>(
      user(readerId),
      `select r.content from public.chapters c join public.chapter_revisions r on r.id = c.published_revision_id where c.id = $1`,
      [chapterId],
    )
    expect(JSON.stringify(content.content)).toContain('Исправленная')

    // Старая версия больше не видна читателю
    expect(await db.query(user(readerId), `select id from public.chapter_revisions where id = $1`, [revisionId])).toHaveLength(0)
    const old = await db.one<{ state: string }>(superuser, `select state from public.chapter_revisions where id = $1`, [revisionId])
    expect(old.state).toBe('superseded')
  })

  it('отклонённую правку можно исправить и отправить повторно', async () => {
    const draft = await db.one<{ id: string }>(user(authorId), `select (public.start_chapter_revision($1)).id`, [chapterId])
    await db.query(user(authorId), `update public.chapter_revisions set content = $1 where id = $2`, [
      JSON.stringify(sampleDoc('Слабая правка')),
      draft.id,
    ])
    await db.query(user(authorId), `select public.submit_chapter_revision($1)`, [draft.id])
    const queueId = await pendingQueueId(`chapter_revision_id = $1`, [draft.id])
    await db.query(user(moderatorId), `select public.reject_submission($1, 'Нужно больше деталей')`, [queueId])

    const rejected = await db.one<{ state: string; rejection_reason: string }>(
      user(authorId),
      `select state, rejection_reason from public.chapter_revisions where id = $1`,
      [draft.id],
    )
    expect(rejected).toEqual({ state: 'rejected', rejection_reason: 'Нужно больше деталей' })

    const upd = await db.query(user(authorId), `update public.chapter_revisions set content = $1 where id = $2 returning id`, [
      JSON.stringify(sampleDoc('Подробная исправленная правка')),
      draft.id,
    ])
    expect(upd).toHaveLength(1)
    await db.query(user(authorId), `select public.submit_chapter_revision($1)`, [draft.id])
    const again = await pendingQueueId(`chapter_revision_id = $1`, [draft.id])
    expect(again).not.toBe(queueId)
  })

  it('модератор не может одобрить собственную заявку, администратор может', async () => {
    const book = await createDraftBook(moderatorId, 'Книга модератора')
    await db.query(user(moderatorId), `select public.submit_book($1)`, [book.id])
    const queueId = await pendingQueueId(`book_id = $1 and kind = 'book'`, [book.id])
    await expect(db.query(user(moderatorId), `select public.approve_submission($1, null)`, [queueId])).rejects.toThrow(
      /собственную/,
    )
    await db.query(user(adminId), `select public.approve_submission($1, null)`, [queueId])
  })

  it('правка опубликованной книги применяется только после одобрения', async () => {
    const rev = await db.one<{ id: string }>(user(authorId), `select (public.start_book_revision($1)).id`, [bookId])
    await db.query(user(authorId), `update public.book_revisions set title = 'Свет над рекой (ред.)' where id = $1`, [rev.id])
    await db.query(user(authorId), `select public.submit_book_revision($1)`, [rev.id])

    let book = await db.one<{ title: string }>(user(readerId), `select title from public.books where id = $1`, [bookId])
    expect(book.title).toBe('Свет над рекой')

    const queueId = await pendingQueueId(`book_revision_id = $1`, [rev.id])
    await db.query(user(moderatorId), `select public.approve_submission($1, null)`, [queueId])
    book = await db.one<{ title: string }>(user(readerId), `select title from public.books where id = $1`, [bookId])
    expect(book.title).toBe('Свет над рекой (ред.)')
  })

  it('автор может отозвать заявку', async () => {
    const book = await createDraftBook(authorId, 'Отозванная')
    await db.query(user(authorId), `select public.submit_book($1)`, [book.id])
    const queueId = await pendingQueueId(`book_id = $1 and kind = 'book'`, [book.id])
    await expect(db.query(user(readerId), `select public.cancel_submission($1)`, [queueId])).rejects.toThrow(/не найдена/)
    await db.query(user(authorId), `select public.cancel_submission($1)`, [queueId])
    const row = await db.one<{ publication_state: string }>(user(authorId), `select publication_state from public.books where id = $1`, [
      book.id,
    ])
    expect(row.publication_state).toBe('draft')
  })

  it('скрытая книга пропадает из каталога', async () => {
    await db.query(user(moderatorId), `select public.set_book_hidden($1, true, 'Проверка жалобы')`, [bookId])
    expect(await db.query(user(readerId), `select id from public.books where id = $1`, [bookId])).toHaveLength(0)
    expect(await db.query(user(readerId), `select id from public.chapters where book_id = $1`, [bookId])).toHaveLength(0)
    await db.query(user(moderatorId), `select public.set_book_hidden($1, false, null)`, [bookId])
    expect(await db.query(user(readerId), `select id from public.books where id = $1`, [bookId])).toHaveLength(1)
  })

  it('filter_books учитывает жанры и права доступа', async () => {
    const all = await db.query<{ id: string }>(user(readerId), `select id from public.filter_books(null, null, null)`)
    expect(all.map((b) => b.id)).toContain(bookId)
    const byGenres = await db.query<{ id: string }>(user(readerId), `select id from public.filter_books(null, $1, null)`, [
      genreIds.slice(0, 2),
    ])
    expect(byGenres.map((b) => b.id)).toContain(bookId)
    const missing = await db.query(user(readerId), `select id from public.filter_books(null, $1, null)`, [[genreIds[0], genreIds[5]]])
    expect(missing.map((b) => b.id)).not.toContain(bookId)
    const byQuery = await db.query(user(readerId), `select id from public.filter_books('над рек', null, null)`)
    expect(byQuery.map((b) => b.id)).toContain(bookId)
    const injection = await db.query(user(readerId), `select id from public.filter_books('%', null, null)`)
    expect(injection).toHaveLength(0)
  })
})

describe('гости и закрытый каталог', () => {
  it('гость ничего не видит, пока каталог закрыт', async () => {
    expect(await db.query(anon, `select id from public.books`)).toHaveLength(0)
    expect(await db.query(anon, `select id from public.genres`)).toHaveLength(0)
    expect(await db.query(anon, `select id from public.profiles`)).toHaveLength(0)
    expect(await db.query(anon, `select id from public.chapter_revisions`)).toHaveLength(0)
    const config = await db.one<{ c: Row }>(anon, `select public.get_public_config() as c`)
    expect(config.c).toEqual({ registration_mode: 'invite', catalog_access: 'members' })
  })

  it('гость не может писать в личные таблицы', async () => {
    await expect(db.query(anon, `insert into public.library_entries (book_id) values (gen_random_uuid())`)).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query(anon, `select * from public.notifications`)).rejects.toThrow(/permission denied/)
  })

  it('при открытом каталоге гость видит только опубликованное', async () => {
    await db.query(superuser, `update public.app_settings set catalog_access = 'public'`)
    try {
      const books = await db.query<{ publication_state: string }>(anon, `select publication_state from public.books`)
      expect(books.length).toBeGreaterThan(0)
      expect(books.every((b) => b.publication_state === 'published')).toBe(true)
      expect((await db.query(anon, `select id from public.genres`)).length).toBeGreaterThan(0)
    } finally {
      await db.query(superuser, `update public.app_settings set catalog_access = 'members'`)
    }
  })

  it('настройки меняет только администратор', async () => {
    await expect(db.query(user(readerId), `select public.update_app_settings('open', 'public')`)).rejects.toThrow(
      /Недостаточно прав/,
    )
    await expect(db.query(user(readerId), `update public.app_settings set catalog_access = 'public'`)).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('личные данные', () => {
  let bookId: string

  beforeAll(async () => {
    const row = await db.one<{ id: string }>(
      superuser,
      `select id from public.books where publication_state = 'published' and author_id = $1 limit 1`,
      [authorId],
    )
    bookId = row.id
  })

  it('библиотека и прогресс видны только владельцу', async () => {
    await db.query(user(readerId), `insert into public.library_entries (book_id, status) values ($1, 'reading')`, [bookId])
    await db.query(user(readerId), `insert into public.reading_progress (book_id, position) values ($1, 0.5)`, [bookId])

    expect(await db.query(user(readerId), `select * from public.library_entries`)).toHaveLength(1)
    expect(await db.query(user(authorId), `select * from public.library_entries`)).toHaveLength(0)
    expect(await db.query(user(authorId), `select * from public.reading_progress`)).toHaveLength(0)

    const book = await db.one<{ library_count: number }>(superuser, `select library_count from public.books where id = $1`, [bookId])
    expect(book.library_count).toBe(1)

    const deleted = await db.query(user(authorId), `delete from public.library_entries where book_id = $1 returning 1`, [bookId])
    expect(deleted).toHaveLength(0)
  })

  it('upsert прогресса работает и не позволяет подменить владельца', async () => {
    await db.query(
      user(readerId),
      `insert into public.reading_progress (book_id, position) values ($1, 0.9)
       on conflict (user_id, book_id) do update set position = excluded.position`,
      [bookId],
    )
    const row = await db.one<{ position: number }>(user(readerId), `select position from public.reading_progress where book_id = $1`, [
      bookId,
    ])
    expect(row.position).toBeCloseTo(0.9)
    await expect(
      db.query(user(readerId), `insert into public.reading_progress (user_id, book_id) values ($1, $2)`, [authorId, bookId]),
    ).rejects.toThrow(/permission denied/)
  })

  it('автор не может оценить свою книгу, рейтинг пересчитывается', async () => {
    await expect(
      db.query(user(authorId), `insert into public.reviews (book_id, rating) values ($1, 10)`, [bookId]),
    ).rejects.toThrow(/row-level security/)
    await db.query(user(readerId), `insert into public.reviews (book_id, rating, body) values ($1, 8, 'Хорошо')`, [bookId])
    await db.query(user(moderatorId), `insert into public.reviews (book_id, rating) values ($1, 6)`, [bookId])
    const book = await db.one<{ rating_avg: string; rating_count: number }>(
      superuser,
      `select rating_avg, rating_count from public.books where id = $1`,
      [bookId],
    )
    expect(Number(book.rating_avg)).toBe(7)
    expect(book.rating_count).toBe(2)
  })

  it('комментарий нельзя удалить чужому пользователю, но может модератор', async () => {
    const c = await db.one<{ id: string }>(user(readerId), `insert into public.comments (book_id, body) values ($1, 'Привет') returning id`, [
      bookId,
    ])
    expect(await db.query(user(authorId), `delete from public.comments where id = $1 returning 1`, [c.id])).toHaveLength(0)
    expect(await db.query(user(moderatorId), `delete from public.comments where id = $1 returning 1`, [c.id])).toHaveLength(1)
  })
})

describe('хранилище файлов', () => {
  it('загружать можно только в свою папку и только изображения', async () => {
    await db.query(user(authorId), `insert into storage.objects (bucket_id, name) values ('media', $1)`, [
      `covers/${authorId}/a.webp`,
    ])
    await expect(
      db.query(user(authorId), `insert into storage.objects (bucket_id, name) values ('media', $1)`, [`covers/${readerId}/b.webp`]),
    ).rejects.toThrow(/row-level security/)
    await expect(
      db.query(user(authorId), `insert into storage.objects (bucket_id, name) values ('media', $1)`, [`covers/${authorId}/x.html`]),
    ).rejects.toThrow(/row-level security/)
    await expect(
      db.query(anon, `insert into storage.objects (bucket_id, name) values ('media', 'covers/x/y.png')`),
    ).rejects.toThrow(/row-level security/)
  })

  it('гость не видит файлы закрытого сайта', async () => {
    expect(await db.query(anon, `select id from storage.objects`)).toHaveLength(0)
    expect((await db.query(user(readerId), `select id from storage.objects`)).length).toBeGreaterThan(0)
  })
})
