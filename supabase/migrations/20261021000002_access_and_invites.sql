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
