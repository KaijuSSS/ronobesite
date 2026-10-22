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
