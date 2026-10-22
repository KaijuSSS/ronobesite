-- =====================================================================
-- RanobeSite: права доступа и политики Row Level Security
-- =====================================================================
-- Принципы:
--  1. RLS включён на каждой таблице схемы public.
--  2. Права на таблицы выдаются явно и по столбцам: служебные поля
--     (publication_state, published_revision_id, счётчики, статусы заявок)
--     изменяются только функциями из миграции publishing.
--  3. Гости (anon) видят каталог только когда app_settings.catalog_access
--     = 'public'. Сейчас сайт закрыт: can_read_catalog() требует входа.

-- ---------------------------------------------------------------------
-- Включаем RLS
-- ---------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.genres enable row level security;
alter table public.books enable row level security;
alter table public.book_genres enable row level security;
alter table public.book_revisions enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_revisions enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.moderation_events enable row level security;
alter table public.library_entries enable row level security;
alter table public.reading_progress enable row level security;
alter table public.reviews enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.invites enable row level security;
alter table public.invite_uses enable row level security;

-- Проверка родительского комментария. Отдельная функция нужна, чтобы
-- политика comments не обращалась к самой себе (это рекурсия RLS).
create function public.comment_in_book(_comment_id uuid, _book_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.comments where id = _comment_id and book_id = _book_id);
$$;

-- ---------------------------------------------------------------------
-- Сбрасываем права, выданные Supabase по умолчанию, и выдаём явно
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Новые функции, созданные будущими миграциями, тоже не должны быть
-- доступны всем по умолчанию.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Чтение. Какие строки видны — решают политики ниже.
grant select on
  public.profiles, public.user_roles, public.genres, public.books, public.book_genres,
  public.chapters, public.chapter_revisions, public.reviews, public.comments
to anon, authenticated;

grant select on
  public.book_revisions, public.moderation_queue, public.moderation_events,
  public.library_entries, public.reading_progress, public.notifications,
  public.reports, public.invites, public.invite_uses
to authenticated;

-- Запись — только разрешённые столбцы.
grant update (username, display_name, bio, avatar_path) on public.profiles to authenticated;

grant insert (title, description, cover_path, status, is_adult) on public.books to authenticated;
grant update (title, description, cover_path, is_adult) on public.books to authenticated;
grant delete on public.books to authenticated;

grant update (title, description, cover_path, is_adult, genre_ids) on public.book_revisions to authenticated;
grant delete on public.book_revisions to authenticated;

grant update (number) on public.chapters to authenticated;
grant delete on public.chapters to authenticated;

grant update (title, content) on public.chapter_revisions to authenticated;
grant delete on public.chapter_revisions to authenticated;

grant insert (book_id, status), update (book_id, status), delete on public.library_entries to authenticated;
grant insert (book_id, chapter_id, position), update (book_id, chapter_id, position), delete
  on public.reading_progress to authenticated;

grant insert (book_id, rating, body), update (book_id, rating, body), delete on public.reviews to authenticated;
grant insert (book_id, chapter_id, parent_id, body), update (body), delete on public.comments to authenticated;

grant update (read_at), delete on public.notifications to authenticated;
grant insert (target_type, target_id, reason) on public.reports to authenticated;

-- ---------------------------------------------------------------------
-- Функции, доступные клиенту
-- ---------------------------------------------------------------------
-- Используются внутри политик, поэтому нужны обеим ролям.
grant execute on function public.has_role(public.app_role) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.can_read_catalog() to anon, authenticated;
grant execute on function public.comment_in_book(uuid, uuid) to authenticated;

-- Чистая функция, вызывается триггером books_set_slug с правами клиента.
grant execute on function public.slugify(text) to anon, authenticated;

grant execute on function public.get_public_config() to anon, authenticated;
grant execute on function public.check_signup(text, text, text) to anon, authenticated;
grant execute on function public.filter_books(text, uuid[], public.work_status[]) to anon, authenticated;

grant execute on function public.set_book_genres(uuid, uuid[]) to authenticated;
grant execute on function public.set_book_status(uuid, public.work_status) to authenticated;
grant execute on function public.submit_book(uuid) to authenticated;
grant execute on function public.start_book_revision(uuid) to authenticated;
grant execute on function public.submit_book_revision(uuid) to authenticated;
grant execute on function public.create_chapter(uuid, numeric, text) to authenticated;
grant execute on function public.start_chapter_revision(uuid) to authenticated;
grant execute on function public.submit_chapter_revision(uuid) to authenticated;
grant execute on function public.cancel_submission(uuid) to authenticated;
grant execute on function public.approve_submission(uuid, text) to authenticated;
grant execute on function public.reject_submission(uuid, text) to authenticated;
grant execute on function public.set_book_hidden(uuid, boolean, text) to authenticated;
grant execute on function public.resolve_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.create_invite(text, public.app_role, integer, integer, text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role, boolean) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.update_app_settings(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Политики
-- ---------------------------------------------------------------------

-- app_settings: прямого доступа нет, настройки читаются через
-- get_public_config() и меняются через update_app_settings().

-- profiles
create policy profiles_select on public.profiles
  for select to anon, authenticated
  using (public.can_read_catalog());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles: роли видны участникам (значки «Модератор»), изменять
-- их можно только через set_user_role().
create policy user_roles_select on public.user_roles
  for select to anon, authenticated
  using (public.can_read_catalog());

-- genres
create policy genres_select on public.genres
  for select to anon, authenticated
  using (public.can_read_catalog());

-- books
create policy books_select on public.books
  for select to anon, authenticated
  using (
    (publication_state = 'published' and public.can_read_catalog())
    or author_id = (select auth.uid())
    or public.is_staff()
  );

create policy books_insert_own on public.books
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy books_update_own_draft on public.books
  for update to authenticated
  using (author_id = (select auth.uid()) and publication_state in ('draft', 'rejected'))
  with check (author_id = (select auth.uid()) and publication_state in ('draft', 'rejected'));

create policy books_delete_own_unpublished on public.books
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and publication_state in ('draft', 'rejected')
    and published_at is null
  );

-- book_genres: видны вместе с книгой; меняются через set_book_genres().
create policy book_genres_select on public.book_genres
  for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id));

-- book_revisions
create policy book_revisions_select on public.book_revisions
  for select to authenticated
  using (author_id = (select auth.uid()) or public.is_staff());

create policy book_revisions_update_own on public.book_revisions
  for update to authenticated
  using (author_id = (select auth.uid()) and state in ('draft', 'rejected'))
  with check (author_id = (select auth.uid()) and state in ('draft', 'rejected'));

create policy book_revisions_delete_own on public.book_revisions
  for delete to authenticated
  using (author_id = (select auth.uid()) and state in ('draft', 'rejected'));

-- chapters: читатели видят только опубликованные главы опубликованных книг.
create policy chapters_select on public.chapters
  for select to anon, authenticated
  using (
    (
      published_revision_id is not null
      and exists (
        select 1 from public.books b
        where b.id = book_id and b.publication_state = 'published'
      )
    )
    or exists (
      select 1 from public.books b
      where b.id = book_id and b.author_id = (select auth.uid())
    )
    or public.is_staff()
  );

create policy chapters_update_own on public.chapters
  for update to authenticated
  using (exists (
    select 1 from public.books b
    where b.id = book_id and b.author_id = (select auth.uid()) and b.publication_state <> 'hidden'
  ))
  with check (exists (
    select 1 from public.books b
    where b.id = book_id and b.author_id = (select auth.uid()) and b.publication_state <> 'hidden'
  ));

create policy chapters_delete_own_unpublished on public.chapters
  for delete to authenticated
  using (
    published_revision_id is null
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.author_id = (select auth.uid())
    )
  );

-- chapter_revisions: читатель видит только текущую опубликованную версию.
create policy chapter_revisions_select on public.chapter_revisions
  for select to anon, authenticated
  using (
    author_id = (select auth.uid())
    or public.is_staff()
    or exists (
      select 1 from public.chapters c
      where c.published_revision_id = chapter_revisions.id
    )
  );

create policy chapter_revisions_update_own on public.chapter_revisions
  for update to authenticated
  using (author_id = (select auth.uid()) and state in ('draft', 'rejected'))
  with check (author_id = (select auth.uid()) and state in ('draft', 'rejected'));

create policy chapter_revisions_delete_own on public.chapter_revisions
  for delete to authenticated
  using (author_id = (select auth.uid()) and state in ('draft', 'rejected'));

-- moderation_queue / moderation_events: автор видит свои заявки,
-- модераторы — все. Изменение только через функции.
create policy moderation_queue_select on public.moderation_queue
  for select to authenticated
  using (submitted_by = (select auth.uid()) or public.is_staff());

create policy moderation_events_select on public.moderation_events
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.moderation_queue q
      where q.id = queue_id and q.submitted_by = (select auth.uid())
    )
  );

-- library_entries
create policy library_select_own on public.library_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy library_insert_own on public.library_entries
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id)
  );

create policy library_update_own on public.library_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id)
  );

create policy library_delete_own on public.library_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- reading_progress
create policy progress_select_own on public.reading_progress
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy progress_insert_own on public.reading_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id)
  );

create policy progress_update_own on public.reading_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id)
  );

create policy progress_delete_own on public.reading_progress
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- reviews: оценивать можно только опубликованные чужие книги.
create policy reviews_select on public.reviews
  for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id));

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.publication_state = 'published' and b.author_id <> (select auth.uid())
    )
  );

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.books b
      where b.id = book_id and b.publication_state = 'published' and b.author_id <> (select auth.uid())
    )
  );

create policy reviews_delete_own_or_staff on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- comments
create policy comments_select on public.comments
  for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = book_id));

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
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

create policy comments_update_own on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy comments_delete_own_or_staff on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- notifications
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- reports
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create policy reports_select_own_or_staff on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_staff());

-- invites
create policy invites_select_admin on public.invites
  for select to authenticated
  using (public.is_admin());

create policy invite_uses_select_admin on public.invite_uses
  for select to authenticated
  using (public.is_admin());
