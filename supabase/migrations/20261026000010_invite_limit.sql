-- =====================================================================
-- RanobeSite: одно приглашение — до 10 000 участников (было 100)
-- =====================================================================
alter table public.invites drop constraint invites_max_uses_check;
alter table public.invites add constraint invites_max_uses_check check (max_uses between 1 and 10000);

create or replace function public.create_invite(
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
    greatest(1, least(coalesce(_max_uses, 1), 10000)),
    case when _expires_in_days is null or _expires_in_days <= 0 then null
         else now() + make_interval(days => least(_expires_in_days, 365)) end,
    nullif(btrim(coalesce(_note, '')), '')
  )
  returning * into v_invite;

  return v_invite;
end;
$$;
