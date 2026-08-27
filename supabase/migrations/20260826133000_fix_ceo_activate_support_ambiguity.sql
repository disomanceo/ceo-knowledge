-- Hotfix: qualify activated_at inside ceo_activate_support() so the
-- RETURNS TABLE output variable does not collide with support_licenses.activated_at.
-- Function-only migration; no account, license, or credential data is rewritten.

begin;

create or replace function public.ceo_activate_support(submitted_key text)
returns table (support_status text, support_plan text, activated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  fingerprint text;
  license public.support_licenses%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(btrim(p.email)) into normalized
    from public.profiles p
   where p.id = auth.uid();

  fingerprint := encode(
    extensions.digest(convert_to(upper(btrim(submitted_key)), 'utf8'), 'sha256'),
    'hex'
  );

  select * into license
    from public.support_licenses l
   where l.user_id = auth.uid()
   for update;

  if license.id is null
     or license.normalized_email <> normalized
     or license.key_fingerprint <> fingerprint then
    raise exception 'Support key does not match this account' using errcode = '42501';
  end if;

  if license.status not in ('ISSUED','ACTIVE') then
    raise exception 'Support license is not activatable' using errcode = '42501';
  end if;

  update public.support_licenses as sl
     set status = 'ACTIVE',
         activated_at = coalesce(sl.activated_at, now()),
         revoked_at = null
   where sl.id = license.id;

  insert into public.admin_audit_log(actor_user_id, target_user_id, action)
  values (auth.uid(), auth.uid(), 'SUPPORT_ACTIVATE');

  return query
    select sl.status, sl.plan, sl.activated_at
      from public.support_licenses sl
     where sl.id = license.id;
end;
$$;

grant execute on function public.ceo_activate_support(text) to authenticated;

commit;
