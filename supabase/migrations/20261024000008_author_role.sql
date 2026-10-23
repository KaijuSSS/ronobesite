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
