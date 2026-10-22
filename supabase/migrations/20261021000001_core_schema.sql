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
create type public.app_role as enum ('reader', 'moderator', 'admin');
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
