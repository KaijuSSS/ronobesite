-- Сгенерировано командой npm run db:bundle. Не редактируйте вручную:
-- исходники лежат в supabase/migrations.
-- Выполните этот файл целиком в SQL Editor нового проекта Supabase.

-- >>> 20261021000001_core_schema.sql
-- =====================================================================
-- RanobeSite: основная схема данных
-- =====================================================================
-- Все таблицы находятся в схеме public и защищены RLS
-- (см. 20261021000004_rls_policies.sql).
-- Функции объявлены с пустым search_path, поэтому все имена в них
-- указываются полностью (public.*, auth.*).

-- ---------------------------------------------------------------------
-- Перечисления
-- ---------------------------------------------------------------------
-- 'author' добавлен позже (миграция 20261024000007); здесь он есть сразу,
-- чтобы setup.sql для нового проекта выполнялся одним запуском.
create type public.app_role as enum ('reader', 'author', 'moderator', 'admin');
create type public.work_status as enum ('ongoing', 'completed', 'hiatus', 'abandoned');
create type public.publication_state as enum ('draft', 'pending', 'published', 'rejected', 'hidden');
create type public.revision_state as enum ('draft', 'pending', 'approved', 'rejected', 'superseded');
create type public.moderation_kind as enum ('book', 'book_revision', 'chapter_revision');
create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.library_status as enum ('reading', 'planned', 'completed', 'dropped');
create type public.report_target as enum ('book', 'chapter', 'comment', 'review', 'profile');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------
-- Общие триггерные функции
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Настройки сайта (одна строка).
-- Позволяют позже открыть регистрацию и каталог без переписывания кода.
-- ---------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  registration_mode text not null default 'invite'
    check (registration_mode in ('invite', 'open')),
  catalog_access text not null default 'members'
    check (catalog_access in ('members', 'public')),
  max_pending_submissions integer not null default 30
    check (max_pending_submissions between 1 and 1000),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Профили: публичные данные пользователей (без e-mail и прочих
-- приватных полей — они остаются в auth.users).
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  bio text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 48),
  constraint profiles_bio_length check (char_length(bio) <= 1000),
  constraint profiles_avatar_path_length check (avatar_path is null or char_length(avatar_path) <= 300)
);

create unique index profiles_username_lower_key on public.profiles (lower(username));

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Роли. Изменяются только через функции администратора.
-- ---------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------
-- Жанры
-- ---------------------------------------------------------------------
create table public.genres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null unique check (char_length(name) between 2 and 40),
  sort_order smallint not null default 0
);

-- ---------------------------------------------------------------------
-- Произведения
-- ---------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  title text not null,
  description text not null default '',
  cover_path text,
  status public.work_status not null default 'ongoing',
  is_adult boolean not null default false,
  publication_state public.publication_state not null default 'draft',
  rejection_reason text,
  published_at timestamptz,
  last_chapter_at timestamptz,
  chapters_count integer not null default 0,
  rating_avg numeric(4, 2) not null default 0,
  rating_count integer not null default 0,
  library_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint books_description_length check (char_length(description) <= 5000),
  constraint books_cover_path_length check (cover_path is null or char_length(cover_path) <= 300)
);

create index books_author_idx on public.books (author_id);
create index books_state_published_idx on public.books (publication_state, published_at desc);
create index books_last_chapter_idx on public.books (last_chapter_at desc nulls last);
create index books_library_count_idx on public.books (library_count desc);
create index books_rating_idx on public.books (rating_avg desc);

create trigger books_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- Транслитерация для адресов вида /book/volshebnyy-sad-1a2b3c
create function public.slugify(_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := coalesce(_value, '');
begin
  s := translate(s, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя');
  s := lower(s);
  s := replace(s, 'щ', 'shch');
  s := replace(s, 'ё', 'yo');
  s := replace(s, 'ж', 'zh');
  s := replace(s, 'х', 'kh');
  s := replace(s, 'ц', 'ts');
  s := replace(s, 'ч', 'ch');
  s := replace(s, 'ш', 'sh');
  s := replace(s, 'ю', 'yu');
  s := replace(s, 'я', 'ya');
  s := translate(s, 'абвгдезийклмнопрстуфыэъь', 'abvgdeziyklmnoprstufye');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := btrim(s, '-');
  s := btrim(left(s, 60), '-');
  if s = '' then
    s := 'book';
  end if;
  return s;
end;
$$;

create function public.books_set_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.slug := public.slugify(new.title) || '-' || left(replace(new.id::text, '-', ''), 6);
  return new;
end;
$$;

create trigger books_set_slug
  before insert on public.books
  for each row execute function public.books_set_slug();

create table public.book_genres (
  book_id uuid not null references public.books (id) on delete cascade,
  genre_id uuid not null references public.genres (id) on delete restrict,
  primary key (book_id, genre_id)
);

create index book_genres_genre_idx on public.book_genres (genre_id);

-- Предложенные изменения уже опубликованного произведения.
create table public.book_revisions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  cover_path text,
  is_adult boolean not null default false,
  genre_ids uuid[] not null default '{}',
  state public.revision_state not null default 'draft',
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_revisions_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint book_revisions_description_length check (char_length(description) <= 5000),
  constraint book_revisions_cover_path_length check (cover_path is null or char_length(cover_path) <= 300),
  constraint book_revisions_genres_count check (cardinality(genre_ids) <= 8)
);

-- Не более одной незавершённой правки на произведение.
create unique index book_revisions_one_open_idx
  on public.book_revisions (book_id)
  where state in ('draft', 'pending', 'rejected');

create trigger book_revisions_updated_at
  before update on public.book_revisions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Главы и их версии
-- ---------------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  number numeric(8, 2) not null check (number >= 0),
  -- Указатель на одобренную версию, которую видят читатели.
  published_revision_id uuid,
  -- Денормализованные данные опубликованной версии для быстрых списков.
  published_title text not null default '',
  word_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapters_book_number_key unique (book_id, number)
);

create index chapters_published_idx on public.chapters (book_id, number) where published_revision_id is not null;

create trigger chapters_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

create table public.chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '',
  -- Текст хранится как JSON-документ Tiptap. HTML не хранится вообще,
  -- поэтому внедрить скрипт через текст главы невозможно.
  content jsonb not null default '{"type": "doc", "content": []}'::jsonb,
  word_count integer not null default 0,
  state public.revision_state not null default 'draft',
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapter_revisions_title_length check (char_length(title) <= 200),
  constraint chapter_revisions_content_doc check (jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc'),
  constraint chapter_revisions_content_size check (octet_length(content::text) <= 600000)
);

create index chapter_revisions_chapter_idx on public.chapter_revisions (chapter_id, created_at desc);

create unique index chapter_revisions_one_open_idx
  on public.chapter_revisions (chapter_id)
  where state in ('draft', 'pending', 'rejected');

alter table public.chapters
  add constraint chapters_published_revision_fk
  foreign key (published_revision_id) references public.chapter_revisions (id) on delete set null;

create function public.chapter_revisions_compute()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.word_count := coalesce((
    select sum(cardinality(regexp_split_to_array(btrim(t #>> '{}'), '\s+')))
    from jsonb_path_query(new.content, 'strict $.**.text') as t
    where btrim(t #>> '{}') <> ''
  ), 0);
  return new;
end;
$$;

create trigger chapter_revisions_compute
  before insert or update of content on public.chapter_revisions
  for each row execute function public.chapter_revisions_compute();

create trigger chapter_revisions_updated_at
  before update on public.chapter_revisions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Модерация
-- ---------------------------------------------------------------------
create table public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  kind public.moderation_kind not null,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete cascade,
  book_revision_id uuid references public.book_revisions (id) on delete cascade,
  chapter_revision_id uuid references public.chapter_revisions (id) on delete cascade,
  submitted_by uuid references public.profiles (id) on delete set null,
  status public.moderation_status not null default 'pending',
  decision_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint moderation_queue_target check (
    (kind = 'book' and book_revision_id is null and chapter_revision_id is null)
    or (kind = 'book_revision' and book_revision_id is not null and chapter_revision_id is null)
    or (kind = 'chapter_revision' and chapter_revision_id is not null and chapter_id is not null)
  )
);

create index moderation_queue_status_idx on public.moderation_queue (status, created_at);
create index moderation_queue_submitter_idx on public.moderation_queue (submitted_by, status);
create index moderation_queue_book_idx on public.moderation_queue (book_id);

-- Одна активная заявка на каждый объект.
create unique index moderation_queue_pending_book_idx
  on public.moderation_queue (book_id) where status = 'pending' and kind = 'book';
create unique index moderation_queue_pending_book_rev_idx
  on public.moderation_queue (book_revision_id) where status = 'pending';
create unique index moderation_queue_pending_chapter_rev_idx
  on public.moderation_queue (chapter_revision_id) where status = 'pending';

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.moderation_queue (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('submitted', 'approved', 'rejected', 'cancelled')),
  reason text,
  created_at timestamptz not null default now()
);

create index moderation_events_queue_idx on public.moderation_events (queue_id, created_at);
create index moderation_events_created_idx on public.moderation_events (created_at desc);

-- ---------------------------------------------------------------------
-- Библиотека и прогресс чтения
-- ---------------------------------------------------------------------
create table public.library_entries (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  status public.library_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index library_entries_book_idx on public.library_entries (book_id);

create trigger library_entries_updated_at
  before update on public.library_entries
  for each row execute function public.set_updated_at();

create table public.reading_progress (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete set null,
  -- Доля прочитанного текста главы: 0 — начало, 1 — конец.
  position real not null default 0 check (position >= 0 and position <= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index reading_progress_user_idx on public.reading_progress (user_id, updated_at desc);

create trigger reading_progress_updated_at
  before update on public.reading_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Отзывы, комментарии, уведомления, жалобы
-- ---------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  body text not null default '' check (char_length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_one_per_user unique (book_id, user_id)
);

create trigger reviews_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_book_idx on public.comments (book_id, created_at desc) where chapter_id is null;
create index comments_chapter_idx on public.comments (chapter_id, created_at desc);

create trigger comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  link text check (link is null or link ~ '^/[A-Za-z0-9/_\-.]*$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------
-- Жанры по умолчанию (справочные данные, нужны и в продакшене)
-- ---------------------------------------------------------------------
insert into public.genres (slug, name, sort_order) values
  ('fantasy', 'Фэнтези', 10),
  ('isekai', 'Исекай', 20),
  ('romance', 'Романтика', 30),
  ('adventure', 'Приключения', 40),
  ('action', 'Боевик', 50),
  ('sci-fi', 'Научная фантастика', 60),
  ('wuxia', 'Уся / Сянься', 70),
  ('detective', 'Детектив', 80),
  ('mystery', 'Мистика', 90),
  ('horror', 'Ужасы', 100),
  ('drama', 'Драма', 110),
  ('comedy', 'Комедия', 120),
  ('slice-of-life', 'Повседневность', 130),
  ('school', 'Школа', 140),
  ('psychology', 'Психология', 150),
  ('historical', 'Историческое', 160),
  ('post-apocalypse', 'Постапокалипсис', 170),
  ('litrpg', 'ЛитРПГ', 180),
  ('cultivation', 'Культивация', 190),
  ('tragedy', 'Трагедия', 200);

-- >>> 20261021000002_access_and_invites.sql
-- =====================================================================
-- RanobeSite: роли, доступ к каталогу, регистрация по приглашениям
-- =====================================================================

-- ---------------------------------------------------------------------
-- Проверки прав. SECURITY DEFINER нужен, чтобы функции могли читать
-- user_roles независимо от RLS; search_path пустой.
-- ---------------------------------------------------------------------
create function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = _role
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin');
$$;

-- Модератор или администратор.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('moderator', 'admin')
  );
$$;

-- Может ли текущий посетитель видеть каталог.
-- Сейчас: только авторизованные участники. Когда app_settings.catalog_access
-- станет 'public', опубликованные книги станут доступны и гостям — без
-- изменения политик.
create function public.can_read_catalog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    or coalesce((select s.catalog_access = 'public' from public.app_settings s where s.id), false);
$$;

-- Конфигурация, которую фронтенд может узнать до входа.
create function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registration_mode', s.registration_mode,
    'catalog_access', s.catalog_access
  )
  from public.app_settings s
  where s.id;
$$;

-- ---------------------------------------------------------------------
-- Приглашения
-- ---------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  -- Коды хранятся в верхнем регистре; при вводе регистр не важен.
  code text not null unique check (code ~ '^[A-Z0-9-]{6,64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  -- Если указан e-mail, приглашением может воспользоваться только он.
  email text check (email is null or email = lower(email)),
  -- Роль, которую получит новый участник.
  role public.app_role not null default 'reader',
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create table public.invite_uses (
  invite_id uuid not null references public.invites (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

create function public.normalize_invite_code(_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(btrim(coalesce(_code, '')));
$$;

-- Проверка перед регистрацией: фронтенд показывает понятную ошибку
-- ещё до отправки формы. Окончательная проверка — в триггере ниже.
create function public.check_signup(_invite_code text, _username text, _email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_invite public.invites;
  v_invite_status text := 'ok';
  v_username_status text := 'ok';
begin
  select registration_mode into v_mode from public.app_settings where id;

  if v_mode = 'invite' then
    select * into v_invite from public.invites
    where code = public.normalize_invite_code(_invite_code);

    if v_invite.id is null
      or v_invite.revoked_at is not null
      or (v_invite.expires_at is not null and v_invite.expires_at < now())
      or v_invite.use_count >= v_invite.max_uses
      or (v_invite.email is not null and v_invite.email <> lower(btrim(coalesce(_email, '')))) then
      v_invite_status := 'invalid';
    end if;
  end if;

  -- Имя проверяем только при действующем приглашении, чтобы посторонние
  -- не могли перебирать имена участников закрытого сайта.
  if v_invite_status <> 'ok' then
    v_username_status := 'unknown';
  elsif coalesce(_username, '') !~ '^[A-Za-z0-9_]{3,24}$' then
    v_username_status := 'invalid';
  elsif exists (select 1 from public.profiles where lower(username) = lower(_username)) then
    v_username_status := 'taken';
  end if;

  return jsonb_build_object(
    'registration_mode', v_mode,
    'invite', v_invite_status,
    'username', v_username_status
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Создание профиля после регистрации.
-- Срабатывает на вставку в auth.users. Если регистрация закрыта и
-- приглашение недействительно — выбрасывает исключение, и Supabase Auth
-- не создаёт пользователя.
-- ---------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_code text := public.normalize_invite_code(new.raw_user_meta_data ->> 'invite_code');
  v_username text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  v_display_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_invite public.invites;
begin
  select registration_mode into v_mode from public.app_settings where id;

  if v_mode = 'invite' then
    select * into v_invite from public.invites where code = v_code for update;

    if v_invite.id is null
      or v_invite.revoked_at is not null
      or (v_invite.expires_at is not null and v_invite.expires_at < now())
      or v_invite.use_count >= v_invite.max_uses
      or (v_invite.email is not null and v_invite.email <> lower(coalesce(new.email, ''))) then
      raise exception 'Регистрация доступна только по действующему приглашению'
        using errcode = 'P0001';
    end if;
  end if;

  if v_username !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Некорректное имя пользователя' using errcode = 'P0001';
  end if;

  if v_display_name is not null then
    v_display_name := left(v_display_name, 48);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, v_display_name);

  insert into public.user_roles (user_id, role) values (new.id, 'reader');

  if v_invite.id is not null then
    if v_invite.role <> 'reader' then
      insert into public.user_roles (user_id, role, granted_by)
      values (new.id, v_invite.role, v_invite.created_by);
    end if;

    insert into public.invite_uses (invite_id, user_id) values (v_invite.id, new.id);
    update public.invites set use_count = use_count + 1 where id = v_invite.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Администрирование
-- ---------------------------------------------------------------------
create function public.create_invite(
  _email text default null,
  _role public.app_role default 'reader',
  _max_uses integer default 1,
  _expires_in_days integer default 14,
  _note text default null
)
returns public.invites
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hex text := upper(replace(gen_random_uuid()::text, '-', ''));
  v_invite public.invites;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  insert into public.invites (code, created_by, email, role, max_uses, expires_at, note)
  values (
    substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) || '-' || substr(v_hex, 13, 4),
    (select auth.uid()),
    nullif(lower(btrim(coalesce(_email, ''))), ''),
    coalesce(_role, 'reader'),
    greatest(1, least(coalesce(_max_uses, 1), 100)),
    case when _expires_in_days is null or _expires_in_days <= 0 then null
         else now() + make_interval(days => least(_expires_in_days, 365)) end,
    nullif(btrim(coalesce(_note, '')), '')
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

create function public.revoke_invite(_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  update public.invites set revoked_at = coalesce(revoked_at, now()) where id = _invite_id;
end;
$$;

create function public.set_user_role(_user_id uuid, _role public.app_role, _enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  if _role = 'reader' then
    raise exception 'Роль читателя есть у всех участников' using errcode = 'P0001';
  end if;

  if not _enabled and _role = 'admin' and _user_id = (select auth.uid()) then
    raise exception 'Нельзя снять роль администратора с самого себя' using errcode = 'P0001';
  end if;

  if _enabled then
    insert into public.user_roles (user_id, role, granted_by)
    values (_user_id, _role, (select auth.uid()))
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = _role;
  end if;
end;
$$;

-- Список участников для администратора (включает e-mail из auth.users).
create function public.admin_list_users()
returns table (
  id uuid,
  username text,
  display_name text,
  email text,
  roles public.app_role[],
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  return query
    select p.id, p.username, p.display_name, u.email::text,
      coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
      p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_roles r on r.user_id = p.id
    group by p.id, u.email, u.last_sign_in_at
    order by p.created_at;
end;
$$;

create function public.update_app_settings(_registration_mode text, _catalog_access text)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  update public.app_settings
  set registration_mode = coalesce(_registration_mode, registration_mode),
      catalog_access = coalesce(_catalog_access, catalog_access)
  where id
  returning * into v_settings;

  return v_settings;
end;
$$;

-- >>> 20261021000003_publishing.sql
-- =====================================================================
-- RanobeSite: публикация, версии и модерация
-- =====================================================================
-- Все изменения состояния публикации выполняются только этими функциями.
-- Прямые запросы клиента не могут изменить publication_state,
-- published_revision_id, статусы заявок и счётчики: у ролей anon и
-- authenticated нет прав на эти столбцы (см. миграцию с RLS).

-- ---------------------------------------------------------------------
-- Вспомогательные функции
-- ---------------------------------------------------------------------
create function public.require_user()
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
  return v_uid;
end;
$$;

-- Простое ограничение частоты публикации: число одновременных заявок
-- одного автора ограничено настройкой app_settings.max_pending_submissions.
create function public.assert_submission_quota(_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  select max_pending_submissions into v_limit from public.app_settings where id;

  if (select count(*) from public.moderation_queue
      where submitted_by = _user_id and status = 'pending') >= v_limit then
    raise exception 'Слишком много заявок ожидают проверки (лимит: %). Дождитесь решения модератора.', v_limit
      using errcode = 'P0001';
  end if;
end;
$$;

create function public.notify_user(_user_id uuid, _type text, _title text, _body text, _link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select _user_id, _type, _title, coalesce(_body, ''), _link
  where _user_id is not null;
$$;

create function public.refresh_book_stats(_book_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.books b
  set chapters_count = s.cnt,
      last_chapter_at = coalesce(s.last_at, b.last_chapter_at)
  from (
    select count(*)::integer as cnt, max(published_at) as last_at
    from public.chapters
    where book_id = _book_id and published_revision_id is not null
  ) s
  where b.id = _book_id;
$$;

-- Проверка, что текущий пользователь — автор произведения.
create function public.assert_book_author(_book_id uuid)
returns public.books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books;
begin
  select * into v_book from public.books where id = _book_id;

  if v_book.id is null or v_book.author_id <> public.require_user() then
    raise exception 'Произведение не найдено или недоступно' using errcode = '42501';
  end if;

  if v_book.publication_state = 'hidden' then
    raise exception 'Произведение скрыто модератором' using errcode = 'P0001';
  end if;

  return v_book;
end;
$$;

-- ---------------------------------------------------------------------
-- Функции автора: произведения
-- ---------------------------------------------------------------------
create function public.set_book_genres(_book_id uuid, _genre_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books := public.assert_book_author(_book_id);
begin
  if v_book.publication_state not in ('draft', 'rejected') then
    raise exception 'Жанры опубликованного произведения меняются через правку на модерацию'
      using errcode = 'P0001';
  end if;

  if cardinality(coalesce(_genre_ids, '{}')) > 8 then
    raise exception 'Можно выбрать не более 8 жанров' using errcode = 'P0001';
  end if;

  delete from public.book_genres where book_id = _book_id;

  insert into public.book_genres (book_id, genre_id)
  select _book_id, g.id from public.genres g where g.id = any (coalesce(_genre_ids, '{}'));
end;
$$;

-- Статус выпуска («продолжается», «завершено»…) автор меняет без модерации.
create function public.set_book_status(_book_id uuid, _status public.work_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_book_author(_book_id);
  update public.books set status = _status where id = _book_id;
end;
$$;

create function public.submit_book(_book_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books := public.assert_book_author(_book_id);
  v_queue_id uuid;
begin
  if v_book.publication_state not in ('draft', 'rejected') then
    raise exception 'Произведение уже отправлено на проверку или опубликовано' using errcode = 'P0001';
  end if;

  if char_length(btrim(v_book.description)) < 20 then
    raise exception 'Добавьте описание длиной не менее 20 символов' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.book_genres where book_id = _book_id) then
    raise exception 'Выберите хотя бы один жанр' using errcode = 'P0001';
  end if;

  perform public.assert_submission_quota(v_book.author_id);

  update public.books
  set publication_state = 'pending', rejection_reason = null
  where id = _book_id;

  insert into public.moderation_queue (kind, book_id, submitted_by)
  values ('book', _book_id, v_book.author_id)
  returning id into v_queue_id;

  insert into public.moderation_events (queue_id, actor_id, action)
  values (v_queue_id, v_book.author_id, 'submitted');

  return v_queue_id;
end;
$$;

-- Начать правку опубликованного произведения: возвращает открытую
-- правку или создаёт новую на основе текущих данных.
create function public.start_book_revision(_book_id uuid)
returns public.book_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books := public.assert_book_author(_book_id);
  v_revision public.book_revisions;
begin
  if v_book.publication_state <> 'published' then
    raise exception 'Черновик редактируется напрямую, правка нужна только для опубликованного произведения'
      using errcode = 'P0001';
  end if;

  select * into v_revision from public.book_revisions
  where book_id = _book_id and state in ('draft', 'pending', 'rejected');

  if v_revision.id is null then
    insert into public.book_revisions (book_id, author_id, title, description, cover_path, is_adult, genre_ids)
    values (
      v_book.id, v_book.author_id, v_book.title, v_book.description, v_book.cover_path, v_book.is_adult,
      coalesce((select array_agg(genre_id) from public.book_genres where book_id = v_book.id), '{}')
    )
    returning * into v_revision;
  end if;

  return v_revision;
end;
$$;

create function public.submit_book_revision(_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.book_revisions;
  v_queue_id uuid;
begin
  select * into v_revision from public.book_revisions where id = _revision_id for update;

  if v_revision.id is null or v_revision.author_id <> public.require_user() then
    raise exception 'Правка не найдена или недоступна' using errcode = '42501';
  end if;

  perform public.assert_book_author(v_revision.book_id);

  if v_revision.state not in ('draft', 'rejected') then
    raise exception 'Правка уже отправлена или обработана' using errcode = 'P0001';
  end if;

  if cardinality(v_revision.genre_ids) = 0 then
    raise exception 'Выберите хотя бы один жанр' using errcode = 'P0001';
  end if;

  perform public.assert_submission_quota(v_revision.author_id);

  update public.book_revisions
  set state = 'pending', submitted_at = now(), rejection_reason = null
  where id = _revision_id;

  insert into public.moderation_queue (kind, book_id, book_revision_id, submitted_by)
  values ('book_revision', v_revision.book_id, v_revision.id, v_revision.author_id)
  returning id into v_queue_id;

  insert into public.moderation_events (queue_id, actor_id, action)
  values (v_queue_id, v_revision.author_id, 'submitted');

  return v_queue_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Функции автора: главы
-- ---------------------------------------------------------------------
create function public.create_chapter(_book_id uuid, _number numeric, _title text default '')
returns public.chapters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books := public.assert_book_author(_book_id);
  v_number numeric := _number;
  v_chapter public.chapters;
begin
  if v_number is null then
    select coalesce(floor(max(number)), 0) + 1 into v_number
    from public.chapters where book_id = _book_id;
  end if;

  if exists (select 1 from public.chapters where book_id = _book_id and number = v_number) then
    raise exception 'Глава с номером % уже существует', v_number using errcode = 'P0001';
  end if;

  insert into public.chapters (book_id, number)
  values (_book_id, v_number)
  returning * into v_chapter;

  insert into public.chapter_revisions (chapter_id, author_id, title)
  values (v_chapter.id, v_book.author_id, left(btrim(coalesce(_title, '')), 200));

  return v_chapter;
end;
$$;

-- Начать правку главы: возвращает открытую версию или создаёт новую
-- из опубликованной. Опубликованная версия остаётся доступной читателям
-- до одобрения новой.
create function public.start_chapter_revision(_chapter_id uuid)
returns public.chapter_revisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chapter public.chapters;
  v_book public.books;
  v_revision public.chapter_revisions;
  v_published public.chapter_revisions;
begin
  select * into v_chapter from public.chapters where id = _chapter_id;
  if v_chapter.id is null then
    raise exception 'Глава не найдена' using errcode = '42501';
  end if;

  v_book := public.assert_book_author(v_chapter.book_id);

  select * into v_revision from public.chapter_revisions
  where chapter_id = _chapter_id and state in ('draft', 'pending', 'rejected');

  if v_revision.id is not null then
    return v_revision;
  end if;

  select * into v_published from public.chapter_revisions where id = v_chapter.published_revision_id;

  insert into public.chapter_revisions (chapter_id, author_id, title, content)
  values (
    _chapter_id,
    v_book.author_id,
    coalesce(v_published.title, ''),
    coalesce(v_published.content, '{"type": "doc", "content": []}'::jsonb)
  )
  returning * into v_revision;

  return v_revision;
end;
$$;

create function public.submit_chapter_revision(_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.chapter_revisions;
  v_chapter public.chapters;
  v_queue_id uuid;
begin
  select * into v_revision from public.chapter_revisions where id = _revision_id for update;

  if v_revision.id is null or v_revision.author_id <> public.require_user() then
    raise exception 'Версия главы не найдена или недоступна' using errcode = '42501';
  end if;

  select * into v_chapter from public.chapters where id = v_revision.chapter_id;
  perform public.assert_book_author(v_chapter.book_id);

  if v_revision.state not in ('draft', 'rejected') then
    raise exception 'Версия уже отправлена или обработана' using errcode = 'P0001';
  end if;

  if char_length(btrim(v_revision.title)) = 0 then
    raise exception 'Укажите название главы' using errcode = 'P0001';
  end if;

  if v_revision.word_count < 1 then
    raise exception 'Глава не может быть пустой' using errcode = 'P0001';
  end if;

  perform public.assert_submission_quota(v_revision.author_id);

  update public.chapter_revisions
  set state = 'pending', submitted_at = now(), rejection_reason = null
  where id = _revision_id;

  insert into public.moderation_queue (kind, book_id, chapter_id, chapter_revision_id, submitted_by)
  values ('chapter_revision', v_chapter.book_id, v_chapter.id, v_revision.id, v_revision.author_id)
  returning id into v_queue_id;

  insert into public.moderation_events (queue_id, actor_id, action)
  values (v_queue_id, v_revision.author_id, 'submitted');

  return v_queue_id;
end;
$$;

-- Автор отзывает свою заявку, объект возвращается в черновик.
create function public.cancel_submission(_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_item public.moderation_queue;
begin
  select * into v_item from public.moderation_queue where id = _queue_id for update;

  if v_item.id is null or v_item.submitted_by is distinct from v_uid then
    raise exception 'Заявка не найдена' using errcode = '42501';
  end if;

  if v_item.status <> 'pending' then
    raise exception 'Заявка уже обработана' using errcode = 'P0001';
  end if;

  update public.moderation_queue set status = 'cancelled' where id = _queue_id;

  case v_item.kind
    when 'book' then
      update public.books set publication_state = 'draft'
      where id = v_item.book_id and publication_state = 'pending';
    when 'book_revision' then
      update public.book_revisions set state = 'draft', submitted_at = null
      where id = v_item.book_revision_id;
    when 'chapter_revision' then
      update public.chapter_revisions set state = 'draft', submitted_at = null
      where id = v_item.chapter_revision_id;
  end case;

  insert into public.moderation_events (queue_id, actor_id, action)
  values (_queue_id, v_uid, 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- Модерация
-- ---------------------------------------------------------------------
-- Блокирует заявку и проверяет, что её можно обработать.
create function public.lock_pending_submission(_queue_id uuid)
returns public.moderation_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_item public.moderation_queue;
begin
  if not public.is_staff() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  select * into v_item from public.moderation_queue where id = _queue_id for update;

  if v_item.id is null then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;

  if v_item.status <> 'pending' then
    raise exception 'Заявка уже обработана' using errcode = 'P0001';
  end if;

  -- Модератор не может одобрять собственные произведения.
  -- Администратор может (на небольшом закрытом сайте он часто и автор).
  if v_item.submitted_by = v_uid and not public.is_admin() then
    raise exception 'Нельзя обрабатывать собственную заявку' using errcode = '42501';
  end if;

  return v_item;
end;
$$;

create function public.approve_submission(_queue_id uuid, _note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_item public.moderation_queue := public.lock_pending_submission(_queue_id);
  v_book_revision public.book_revisions;
  v_chapter_revision public.chapter_revisions;
  v_book public.books;
  v_first_publication boolean;
begin
  select * into v_book from public.books where id = v_item.book_id for update;

  case v_item.kind
    when 'book' then
      update public.books
      set publication_state = 'published',
          published_at = coalesce(published_at, now()),
          rejection_reason = null
      where id = v_item.book_id;

      perform public.notify_user(v_item.submitted_by, 'book_approved',
        'Произведение опубликовано', v_book.title, '/studio/books/' || v_book.id);

    when 'book_revision' then
      select * into v_book_revision from public.book_revisions
      where id = v_item.book_revision_id for update;

      update public.books
      set title = v_book_revision.title,
          description = v_book_revision.description,
          cover_path = v_book_revision.cover_path,
          is_adult = v_book_revision.is_adult
      where id = v_item.book_id;

      delete from public.book_genres where book_id = v_item.book_id;
      insert into public.book_genres (book_id, genre_id)
      select v_item.book_id, g.id from public.genres g where g.id = any (v_book_revision.genre_ids);

      update public.book_revisions
      set state = 'approved', reviewed_at = now(), rejection_reason = null
      where id = v_book_revision.id;

      perform public.notify_user(v_item.submitted_by, 'book_revision_approved',
        'Изменения произведения одобрены', v_book_revision.title, '/studio/books/' || v_book.id);

    when 'chapter_revision' then
      select * into v_chapter_revision from public.chapter_revisions
      where id = v_item.chapter_revision_id for update;

      select published_revision_id is null into v_first_publication
      from public.chapters where id = v_item.chapter_id for update;

      update public.chapter_revisions
      set state = 'superseded'
      where chapter_id = v_item.chapter_id and state = 'approved';

      update public.chapter_revisions
      set state = 'approved', reviewed_at = now(), rejection_reason = null
      where id = v_chapter_revision.id;

      update public.chapters
      set published_revision_id = v_chapter_revision.id,
          published_title = v_chapter_revision.title,
          word_count = v_chapter_revision.word_count,
          published_at = coalesce(published_at, now())
      where id = v_item.chapter_id;

      if v_first_publication then
        update public.books set last_chapter_at = now() where id = v_item.book_id;
      end if;
      perform public.refresh_book_stats(v_item.book_id);

      perform public.notify_user(v_item.submitted_by, 'chapter_approved',
        'Глава опубликована', v_book.title || ': ' || v_chapter_revision.title,
        '/studio/books/' || v_book.id || '/chapters/' || v_item.chapter_id);
  end case;

  update public.moderation_queue
  set status = 'approved', reviewed_by = v_uid, reviewed_at = now(),
      decision_reason = nullif(btrim(coalesce(_note, '')), '')
  where id = _queue_id;

  insert into public.moderation_events (queue_id, actor_id, action, reason)
  values (_queue_id, v_uid, 'approved', nullif(btrim(coalesce(_note, '')), ''));
end;
$$;

create function public.reject_submission(_queue_id uuid, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_reason text := btrim(coalesce(_reason, ''));
  v_item public.moderation_queue;
  v_book public.books;
begin
  if char_length(v_reason) < 5 then
    raise exception 'Укажите причину отклонения (не менее 5 символов)' using errcode = 'P0001';
  end if;

  v_item := public.lock_pending_submission(_queue_id);
  select * into v_book from public.books where id = v_item.book_id;

  case v_item.kind
    when 'book' then
      update public.books
      set publication_state = 'rejected', rejection_reason = v_reason
      where id = v_item.book_id;

      perform public.notify_user(v_item.submitted_by, 'book_rejected',
        'Произведение отклонено', v_reason, '/studio/books/' || v_book.id);

    when 'book_revision' then
      update public.book_revisions
      set state = 'rejected', reviewed_at = now(), rejection_reason = v_reason
      where id = v_item.book_revision_id;

      perform public.notify_user(v_item.submitted_by, 'book_revision_rejected',
        'Изменения произведения отклонены', v_reason, '/studio/books/' || v_book.id);

    when 'chapter_revision' then
      update public.chapter_revisions
      set state = 'rejected', reviewed_at = now(), rejection_reason = v_reason
      where id = v_item.chapter_revision_id;

      perform public.notify_user(v_item.submitted_by, 'chapter_rejected',
        'Глава отклонена', v_reason,
        '/studio/books/' || v_book.id || '/chapters/' || v_item.chapter_id);
  end case;

  update public.moderation_queue
  set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), decision_reason = v_reason
  where id = _queue_id;

  insert into public.moderation_events (queue_id, actor_id, action, reason)
  values (_queue_id, v_uid, 'rejected', v_reason);
end;
$$;

-- Скрыть опубликованное произведение (например, по жалобе) или вернуть его.
create function public.set_book_hidden(_book_id uuid, _hidden boolean, _reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books;
begin
  if not public.is_staff() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  select * into v_book from public.books where id = _book_id for update;
  if v_book.id is null then
    raise exception 'Произведение не найдено' using errcode = 'P0002';
  end if;

  if _hidden then
    if v_book.publication_state <> 'published' then
      raise exception 'Скрыть можно только опубликованное произведение' using errcode = 'P0001';
    end if;
    update public.books
    set publication_state = 'hidden', rejection_reason = nullif(btrim(coalesce(_reason, '')), '')
    where id = _book_id;
    perform public.notify_user(v_book.author_id, 'book_hidden', 'Произведение скрыто модератором',
      coalesce(_reason, ''), '/studio/books/' || v_book.id);
  else
    if v_book.publication_state <> 'hidden' then
      raise exception 'Произведение не скрыто' using errcode = 'P0001';
    end if;
    update public.books set publication_state = 'published', rejection_reason = null where id = _book_id;
  end if;
end;
$$;

create function public.resolve_report(_report_id uuid, _status public.report_status, _note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  if _status = 'open' then
    raise exception 'Укажите итоговый статус жалобы' using errcode = 'P0001';
  end if;

  update public.reports
  set status = _status, resolved_by = (select auth.uid()), resolved_at = now(),
      resolution_note = nullif(btrim(coalesce(_note, '')), '')
  where id = _report_id and status = 'open';

  if not found then
    raise exception 'Жалоба не найдена или уже обработана' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Поиск по каталогу. SECURITY INVOKER: выполняется с правами
-- вызывающего, поэтому RLS скрывает неопубликованные книги.
-- Сортировка и постраничный вывод — на стороне PostgREST.
-- ---------------------------------------------------------------------
create function public.filter_books(
  _query text default null,
  _genre_ids uuid[] default null,
  _statuses public.work_status[] default null
)
returns setof public.books
language sql
stable
security invoker
set search_path = ''
as $$
  select b.*
  from public.books b
  where b.publication_state = 'published'
    and (
      coalesce(btrim(_query), '') = ''
      or b.title ilike '%' || replace(replace(replace(btrim(_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    and (
      _genre_ids is null or cardinality(_genre_ids) = 0
      or (
        select count(distinct bg.genre_id) from public.book_genres bg
        where bg.book_id = b.id and bg.genre_id = any (_genre_ids)
      ) = cardinality(_genre_ids)
    )
    and (_statuses is null or cardinality(_statuses) = 0 or b.status = any (_statuses));
$$;

-- ---------------------------------------------------------------------
-- Счётчики: рейтинг и популярность
-- ---------------------------------------------------------------------
-- Пересчитываются и старая, и новая книга: upsert через PostgREST
-- формально может изменить book_id.
create function public.reviews_refresh_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book_id uuid;
begin
  foreach v_book_id in array array_remove(array[
    case when tg_op <> 'INSERT' then old.book_id end,
    case when tg_op <> 'DELETE' then new.book_id end
  ], null) loop
    update public.books b
    set rating_avg = coalesce(s.avg_rating, 0), rating_count = s.cnt
    from (
      select round(avg(rating)::numeric, 2) as avg_rating, count(*)::integer as cnt
      from public.reviews where book_id = v_book_id
    ) s
    where b.id = v_book_id;
  end loop;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update of rating, book_id or delete on public.reviews
  for each row execute function public.reviews_refresh_rating();

create function public.library_refresh_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book_id uuid;
begin
  foreach v_book_id in array array_remove(array[
    case when tg_op <> 'INSERT' then old.book_id end,
    case when tg_op <> 'DELETE' then new.book_id end
  ], null) loop
    update public.books
    set library_count = (select count(*) from public.library_entries where book_id = v_book_id)
    where id = v_book_id;
  end loop;
  return null;
end;
$$;

create trigger library_refresh_count
  after insert or update of book_id or delete on public.library_entries
  for each row execute function public.library_refresh_count();

-- Удаление неопубликованной главы — обновить счётчики не требуется,
-- но удаление опубликованной (модератором) должно пересчитать их.
create function public.chapters_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_book_stats(old.book_id);
  return null;
end;
$$;

create trigger chapters_after_delete
  after delete on public.chapters
  for each row execute function public.chapters_after_delete();

-- >>> 20261021000004_rls_policies.sql
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

-- >>> 20261021000005_storage.sql
-- =====================================================================
-- RanobeSite: хранилище изображений (обложки и аватары)
-- =====================================================================
-- Бакет приватный: файлы выдаются по временным подписанным ссылкам
-- и только тем, кому доступен каталог (can_read_catalog()).
-- Структура путей:
--   covers/<user_id>/<random>.<ext>
--   avatars/<user_id>/<random>.<ext>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy media_select_members on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media' and public.can_read_catalog());

create policy media_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('covers', 'avatars')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy media_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('covers', 'avatars')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy media_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- >>> 20261023000006_social.sql
-- =====================================================================
-- RanobeSite: лайки глав, прочтения, подписки на авторов, уведомления
-- о комментариях и новых главах, изображения в тексте глав
-- =====================================================================
-- В уже развёрнутом проекте эту миграцию достаточно выполнить отдельно
-- в SQL Editor. Она ничего не удаляет.
--
-- Новые таблицы закрыты для прямых запросов клиента: всё чтение и
-- изменение идёт через функции ниже, которые сами проверяют права.

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------
create table public.chapter_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create index chapter_likes_chapter_idx on public.chapter_likes (chapter_id);

-- Кто дочитал главу. Одна запись на читателя, автор не учитывается.
create table public.chapter_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

create index chapter_reads_chapter_idx on public.chapter_reads (chapter_id);

create table public.author_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  constraint author_follows_not_self check (follower_id <> author_id)
);

create index author_follows_author_idx on public.author_follows (author_id);

alter table public.chapter_likes enable row level security;
alter table public.chapter_reads enable row level security;
alter table public.author_follows enable row level security;

-- Supabase по умолчанию выдаёт права на новые таблицы — забираем их.
revoke all on public.chapter_likes, public.chapter_reads, public.author_follows from anon, authenticated;

-- ---------------------------------------------------------------------
-- Вспомогательные функции
-- ---------------------------------------------------------------------
-- Видит ли текущий пользователь главу (те же правила, что в политике chapters).
create function public.can_view_chapter(_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = _chapter_id
      and (
        (c.published_revision_id is not null and b.publication_state = 'published' and public.can_read_catalog())
        or b.author_id = (select auth.uid())
        or public.is_staff()
      )
  );
$$;

-- Опубликованная глава опубликованной книги: только её можно лайкать
-- и отмечать прочитанной.
create function public.is_chapter_public(_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = _chapter_id and c.published_revision_id is not null and b.publication_state = 'published'
  );
$$;

create function public.chapter_label(_number numeric, _title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'Глава ' || trim_scale(_number)::text || coalesce(': ' || nullif(btrim(_title), ''), '');
$$;

-- ---------------------------------------------------------------------
-- Лайки
-- ---------------------------------------------------------------------
create function public.chapter_like_info(_chapter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_view_chapter(_chapter_id) then
    raise exception 'Глава не найдена' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'count', (select count(*) from public.chapter_likes where chapter_id = _chapter_id),
    'liked', exists (
      select 1 from public.chapter_likes where chapter_id = _chapter_id and user_id = (select auth.uid())
    )
  );
end;
$$;

create function public.toggle_chapter_like(_chapter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if not public.is_chapter_public(_chapter_id) or not public.can_view_chapter(_chapter_id) then
    raise exception 'Отметить можно только опубликованную главу' using errcode = 'P0001';
  end if;

  delete from public.chapter_likes where user_id = v_uid and chapter_id = _chapter_id;
  if not found then
    insert into public.chapter_likes (user_id, chapter_id) values (v_uid, _chapter_id)
    on conflict do nothing;
  end if;

  return public.chapter_like_info(_chapter_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Прочтения
-- ---------------------------------------------------------------------
create function public.mark_chapter_read(_chapter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_author uuid;
begin
  if not public.is_chapter_public(_chapter_id) or not public.can_view_chapter(_chapter_id) then
    return;
  end if;

  select b.author_id into v_author
  from public.chapters c join public.books b on b.id = c.book_id
  where c.id = _chapter_id;

  -- Свои главы автор не «читает».
  if v_author = v_uid then
    return;
  end if;

  insert into public.chapter_reads (user_id, chapter_id) values (v_uid, _chapter_id)
  on conflict do nothing;
end;
$$;

-- Статистика глав для автора книги (и модераторов): лайки и прочтения.
create function public.book_chapter_stats(_book_id uuid)
returns table (chapter_id uuid, likes integer, reads integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.books b
    where b.id = _book_id and (b.author_id = (select auth.uid()) or public.is_staff())
  ) then
    raise exception 'Произведение не найдено или недоступно' using errcode = '42501';
  end if;

  return query
    select c.id,
      (select count(*)::integer from public.chapter_likes l where l.chapter_id = c.id),
      (select count(*)::integer from public.chapter_reads r where r.chapter_id = c.id)
    from public.chapters c
    where c.book_id = _book_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Подписки на авторов
-- ---------------------------------------------------------------------
create function public.follow_info(_author_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_read_catalog() then
    raise exception 'Требуется вход в аккаунт' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'followers', (select count(*) from public.author_follows where author_id = _author_id),
    'following', exists (
      select 1 from public.author_follows where author_id = _author_id and follower_id = (select auth.uid())
    )
  );
end;
$$;

create function public.toggle_follow(_author_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_follower public.profiles;
begin
  if _author_id = v_uid then
    raise exception 'Нельзя подписаться на самого себя' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = _author_id) then
    raise exception 'Пользователь не найден' using errcode = 'P0002';
  end if;

  delete from public.author_follows where follower_id = v_uid and author_id = _author_id;
  if not found then
    insert into public.author_follows (follower_id, author_id) values (v_uid, _author_id)
    on conflict do nothing;

    if found then
      select * into v_follower from public.profiles where id = v_uid;
      perform public.notify_user(_author_id, 'new_follower', 'Новый подписчик',
        coalesce(v_follower.display_name, v_follower.username), '/profile/' || v_follower.username);
    end if;
  end if;

  return public.follow_info(_author_id);
end;
$$;

-- Уведомление всем подписчикам автора.
create function public.notify_followers(_author_id uuid, _type text, _title text, _body text, _link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select f.follower_id, _type, _title, coalesce(_body, ''), _link
  from public.author_follows f
  where f.author_id = _author_id;
$$;

-- Первая публикация произведения.
create function public.books_notify_followers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author public.profiles;
begin
  select * into v_author from public.profiles where id = new.author_id;
  perform public.notify_followers(new.author_id, 'followed_new_book',
    'Новое произведение: ' || new.title,
    'Автор: ' || coalesce(v_author.display_name, v_author.username),
    '/book/' || new.slug);
  return null;
end;
$$;

create trigger books_notify_followers
  after update of published_at on public.books
  for each row
  when (old.published_at is null and new.published_at is not null)
  execute function public.books_notify_followers();

-- Первая публикация главы (правки уже опубликованной главы не рассылаются).
create function public.chapters_notify_followers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books;
begin
  select * into v_book from public.books where id = new.book_id;
  if v_book.publication_state <> 'published' then
    return null;
  end if;

  perform public.notify_followers(v_book.author_id, 'followed_new_chapter',
    'Новая глава: ' || v_book.title,
    public.chapter_label(new.number, new.published_title),
    '/book/' || v_book.slug || '/chapter/' || new.id);
  return null;
end;
$$;

create trigger chapters_notify_followers
  after update of published_revision_id on public.chapters
  for each row
  when (old.published_revision_id is null and new.published_revision_id is not null)
  execute function public.chapters_notify_followers();

-- ---------------------------------------------------------------------
-- Уведомления о комментариях
-- ---------------------------------------------------------------------
create function public.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books;
  v_name text;
  v_where text;
  v_link text;
  v_parent_author uuid;
  v_text text := left(new.body, 200);
begin
  select * into v_book from public.books where id = new.book_id;
  select coalesce(display_name, username) into v_name from public.profiles where id = new.user_id;

  if new.chapter_id is not null then
    select public.chapter_label(c.number, c.published_title) into v_where
    from public.chapters c where c.id = new.chapter_id;
    v_link := '/book/' || v_book.slug || '/chapter/' || new.chapter_id;
  else
    v_where := 'Обсуждение произведения';
    v_link := '/book/' || v_book.slug;
  end if;

  if v_book.author_id <> new.user_id then
    perform public.notify_user(v_book.author_id, 'comment',
      'Новый комментарий: ' || v_book.title,
      v_where || ' — ' || v_name || ': ' || v_text, v_link);
  end if;

  if new.parent_id is not null then
    select user_id into v_parent_author from public.comments where id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.user_id and v_parent_author <> v_book.author_id then
      perform public.notify_user(v_parent_author, 'comment_reply',
        'Ответ на ваш комментарий',
        v_name || ': ' || v_text, v_link);
    end if;
  end if;

  return null;
end;
$$;

create trigger comments_notify
  after insert on public.comments
  for each row execute function public.comments_notify();

-- ---------------------------------------------------------------------
-- Изображения в главах: папка chapters/<user_id>/ в бакете media
-- ---------------------------------------------------------------------
alter policy media_insert_own_folder on storage.objects
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('covers', 'avatars', 'chapters')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

alter policy media_update_own_folder on storage.objects
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('covers', 'avatars', 'chapters')
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

-- ---------------------------------------------------------------------
-- Права на функции
-- ---------------------------------------------------------------------
-- Право выполнения для PUBLIC выдаётся новым функциям глобально, поэтому
-- снимаем его явно и выдаём только то, что нужно клиенту.
revoke execute on function
  public.can_view_chapter(uuid),
  public.is_chapter_public(uuid),
  public.chapter_label(numeric, text),
  public.chapter_like_info(uuid),
  public.toggle_chapter_like(uuid),
  public.mark_chapter_read(uuid),
  public.book_chapter_stats(uuid),
  public.follow_info(uuid),
  public.toggle_follow(uuid),
  public.notify_followers(uuid, text, text, text, text),
  public.books_notify_followers(),
  public.chapters_notify_followers(),
  public.comments_notify()
from public, anon, authenticated;

grant execute on function public.chapter_like_info(uuid) to anon, authenticated;
grant execute on function public.follow_info(uuid) to anon, authenticated;
grant execute on function public.toggle_chapter_like(uuid) to authenticated;
grant execute on function public.mark_chapter_read(uuid) to authenticated;
grant execute on function public.book_chapter_stats(uuid) to authenticated;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- >>> 20261024000007_author_role_enum.sql
-- =====================================================================
-- RanobeSite: роль «Автор» (шаг 1 из 2)
-- =====================================================================
-- Новое значение перечисления нельзя использовать в той же транзакции,
-- в которой оно добавлено, поэтому в уже развёрнутом проекте этот файл
-- выполняется отдельным запуском, а следующий — после него.
-- В новом проекте значение уже есть, и команда ничего не делает.
alter type public.app_role add value if not exists 'author' after 'reader';

-- >>> 20261024000008_author_role.sql
-- =====================================================================
-- RanobeSite: роль «Автор» (шаг 2 из 2)
-- =====================================================================
-- Создавать произведения, добавлять главы и отправлять их на проверку
-- могут только авторы, модераторы и администраторы. Остальные участники
-- читают, оценивают и комментируют. Роль выдаёт администратор
-- (set_user_role) или приглашение с ролью 'author'.

create function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('author', 'moderator', 'admin')
  );
$$;

revoke execute on function public.can_write() from public, anon;
grant execute on function public.can_write() to authenticated;

-- Новые книги — только авторам.
alter policy books_insert_own on public.books
  with check (author_id = (select auth.uid()) and public.can_write());

-- Все действия автора с книгой (жанры, статус, главы, отправка на проверку)
-- проходят через assert_book_author — добавляем в неё проверку роли.
create or replace function public.assert_book_author(_book_id uuid)
returns public.books
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.books;
begin
  select * into v_book from public.books where id = _book_id;

  if v_book.id is null or v_book.author_id <> public.require_user() then
    raise exception 'Произведение не найдено или недоступно' using errcode = '42501';
  end if;

  if not public.can_write() then
    raise exception 'Публиковать могут только авторы. Попросите администратора выдать роль «Автор».'
      using errcode = '42501';
  end if;

  if v_book.publication_state = 'hidden' then
    raise exception 'Произведение скрыто модератором' using errcode = 'P0001';
  end if;

  return v_book;
end;
$$;

-- Тем, кто уже успел что-то написать, роль выдаётся автоматически.
insert into public.user_roles (user_id, role)
select distinct author_id, 'author'::public.app_role from public.books
on conflict (user_id, role) do nothing;
