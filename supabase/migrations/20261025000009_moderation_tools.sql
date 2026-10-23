-- =====================================================================
-- RanobeSite: блокировка участников, правка и удаление глав модератором
-- =====================================================================
-- Блокирует только администратор. Заблокированный участник может войти,
-- но не видит каталог и ничего не может писать: проверка встроена в
-- can_read_catalog(), can_write(), require_user() и политики записи.

-- ---------------------------------------------------------------------
-- Блокировки
-- ---------------------------------------------------------------------
create table public.user_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.user_bans enable row level security;
revoke all on public.user_bans from anon, authenticated;
grant select on public.user_bans to authenticated;

create policy user_bans_select_admin on public.user_bans
  for select to authenticated
  using (public.is_admin());

create function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_bans where user_id = (select auth.uid()));
$$;

-- Причина блокировки — только самому участнику (для экрана «Аккаунт заблокирован»).
create function public.my_ban()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('reason', b.reason, 'banned_at', b.created_at)
  from public.user_bans b
  where b.user_id = (select auth.uid());
$$;

create function public.set_user_ban(_user_id uuid, _banned boolean, _reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_reason text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  if _user_id = v_uid then
    raise exception 'Нельзя заблокировать самого себя' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = _user_id) then
    raise exception 'Пользователь не найден' using errcode = 'P0001';
  end if;

  if not _banned then
    delete from public.user_bans where user_id = _user_id;
    return;
  end if;

  if exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin') then
    raise exception 'Сначала снимите с участника роль администратора' using errcode = 'P0001';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Укажите причину блокировки (не менее 5 символов)' using errcode = 'P0001';
  end if;

  insert into public.user_bans (user_id, reason, banned_by)
  values (_user_id, left(v_reason, 500), v_uid)
  on conflict (user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by;
end;
$$;

-- ---------------------------------------------------------------------
-- Проверки доступа с учётом блокировки
-- ---------------------------------------------------------------------
create or replace function public.can_read_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_banned()
    and (
      (select auth.uid()) is not null
      or coalesce((select s.catalog_access = 'public' from public.app_settings s where s.id), false)
    );
$$;

create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_banned() and exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('author', 'moderator', 'admin')
  );
$$;

-- Через require_user проходят все функции автора, модератора, лайки,
-- подписки и отметки о прочтении.
create or replace function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Требуется вход в аккаунт' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Ваш аккаунт заблокирован' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Прямая запись в таблицы — тоже только без блокировки.
alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()) and not public.is_banned())
  with check (id = (select auth.uid()) and not public.is_banned());

alter policy books_update_own_draft on public.books
  using (author_id = (select auth.uid()) and publication_state in ('draft', 'rejected') and not public.is_banned())
  with check (author_id = (select auth.uid()) and publication_state in ('draft', 'rejected') and not public.is_banned());

alter policy chapter_revisions_update_own on public.chapter_revisions
  using (author_id = (select auth.uid()) and state in ('draft', 'rejected') and not public.is_banned())
  with check (author_id = (select auth.uid()) and state in ('draft', 'rejected') and not public.is_banned());

alter policy comments_insert_own on public.comments
  with check (
    user_id = (select auth.uid())
    and not public.is_banned()
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.publication_state = 'published'
    )
    and (
      chapter_id is null
      or exists (
        select 1 from public.chapters c
        where c.id = chapter_id and c.book_id = comments.book_id and c.published_revision_id is not null
      )
    )
    and (parent_id is null or public.comment_in_book(parent_id, book_id))
  );

alter policy comments_update_own on public.comments
  using (user_id = (select auth.uid()) and not public.is_banned())
  with check (user_id = (select auth.uid()) and not public.is_banned());

alter policy reviews_insert_own on public.reviews
  with check (
    user_id = (select auth.uid())
    and not public.is_banned()
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.publication_state = 'published' and b.author_id <> (select auth.uid())
    )
  );

alter policy reviews_update_own on public.reviews
  using (user_id = (select auth.uid()) and not public.is_banned())
  with check (
    user_id = (select auth.uid())
    and not public.is_banned()
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.publication_state = 'published' and b.author_id <> (select auth.uid())
    )
  );

alter policy reports_insert_own on public.reports
  with check (reporter_id = (select auth.uid()) and not public.is_banned());

alter policy media_insert_own_folder on storage.objects
  with check (
    bucket_id = 'media'
    and not public.is_banned()
    and (storage.foldername(name))[1] in ('covers', 'avatars', 'chapters')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

-- ---------------------------------------------------------------------
-- Модератор: правка и удаление опубликованных глав
-- ---------------------------------------------------------------------
-- Исправленный текст публикуется сразу новой версией от имени автора
-- книги; прежняя версия остаётся в истории как superseded.
create function public.staff_edit_chapter(_chapter_id uuid, _title text, _content jsonb, _note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_chapter public.chapters;
  v_book public.books;
  v_revision public.chapter_revisions;
  v_note text := nullif(btrim(coalesce(_note, '')), '');
begin
  if not public.is_staff() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  select * into v_chapter from public.chapters where id = _chapter_id for update;
  if v_chapter.id is null then
    raise exception 'Глава не найдена' using errcode = 'P0001';
  end if;
  if v_chapter.published_revision_id is null then
    raise exception 'Исправлять можно только опубликованную главу. Черновики проходят обычную проверку.'
      using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(_title, ''))) = 0 then
    raise exception 'Укажите название главы' using errcode = 'P0001';
  end if;

  select * into v_book from public.books where id = v_chapter.book_id;

  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at, reviewed_at)
  values (_chapter_id, v_book.author_id, left(btrim(_title), 200), _content, 'approved', now(), now())
  returning * into v_revision;

  if v_revision.word_count < 1 then
    raise exception 'Глава не может быть пустой' using errcode = 'P0001';
  end if;

  update public.chapter_revisions
  set state = 'superseded'
  where chapter_id = _chapter_id and state = 'approved' and id <> v_revision.id;

  update public.chapters
  set published_revision_id = v_revision.id,
      published_title = v_revision.title,
      word_count = v_revision.word_count
  where id = _chapter_id;

  if v_book.author_id <> v_uid then
    perform public.notify_user(v_book.author_id, 'chapter_edited', 'Модератор исправил главу',
      v_book.title || ': ' || public.chapter_label(v_chapter.number, v_revision.title)
        || coalesce(' — ' || v_note, ''),
      '/book/' || v_book.slug || '/chapter/' || _chapter_id);
  end if;
end;
$$;

create function public.staff_delete_chapter(_chapter_id uuid, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_chapter public.chapters;
  v_book public.books;
  v_reason text := btrim(coalesce(_reason, ''));
begin
  if not public.is_staff() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Укажите причину удаления (не менее 5 символов)' using errcode = 'P0001';
  end if;

  select * into v_chapter from public.chapters where id = _chapter_id;
  if v_chapter.id is null then
    raise exception 'Глава не найдена' using errcode = 'P0001';
  end if;
  select * into v_book from public.books where id = v_chapter.book_id;

  delete from public.chapters where id = _chapter_id;

  if v_book.author_id <> v_uid then
    perform public.notify_user(v_book.author_id, 'chapter_deleted', 'Глава удалена модератором',
      v_book.title || ': ' || public.chapter_label(v_chapter.number, v_chapter.published_title) || ' — ' || v_reason,
      '/studio/books/' || v_book.id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Права на функции
-- ---------------------------------------------------------------------
revoke execute on function
  public.is_banned(),
  public.my_ban(),
  public.set_user_ban(uuid, boolean, text),
  public.staff_edit_chapter(uuid, text, jsonb, text),
  public.staff_delete_chapter(uuid, text)
from public, anon, authenticated;

-- is_banned используется внутри политик, поэтому нужна обеим ролям.
grant execute on function public.is_banned() to anon, authenticated;
grant execute on function public.my_ban() to authenticated;
grant execute on function public.set_user_ban(uuid, boolean, text) to authenticated;
grant execute on function public.staff_edit_chapter(uuid, text, jsonb, text) to authenticated;
grant execute on function public.staff_delete_chapter(uuid, text) to authenticated;
