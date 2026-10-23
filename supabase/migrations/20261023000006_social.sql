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
