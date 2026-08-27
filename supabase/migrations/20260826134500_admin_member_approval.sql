-- Admin member management for Ceo desktop.
-- Adds read/update RPCs only; does not modify auth credentials or existing rows.

begin;

create or replace function public.ceo_admin_members()
returns table (
  member_user_id uuid,
  email text,
  display_name text,
  account_status text,
  account_role text,
  support_status text,
  online boolean,
  last_seen_at timestamptz,
  created_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.display_name,
    p.status::text,
    p.role::text,
    p.support_status,
    coalesce(mp.last_seen_at >= now() - interval '2 minutes', false),
    mp.last_seen_at,
    p.created_at,
    p.approved_at
  from public.profiles p
  left join public.member_presence mp on mp.user_id = p.id
  where public.is_admin(auth.uid())
  order by
    case when p.role::text = 'admin' then 0 else 1 end,
    p.created_at desc,
    p.email;
$$;

create or replace function public.ceo_admin_set_member_status(target_user uuid, next_status text)
returns table (
  member_user_id uuid,
  email text,
  display_name text,
  account_status text,
  account_role text,
  support_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text := lower(btrim(next_status));
  target_email text;
  target_role text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Approved admin required' using errcode = '42501';
  end if;

  if normalized_status not in ('approved', 'rejected') then
    raise exception 'Member status must be approved or rejected';
  end if;

  if target_user = auth.uid() then
    raise exception 'Admin cannot change own approval status' using errcode = '42501';
  end if;

  update public.profiles as p
     set status = normalized_status::public.member_status,
         approved_at = case
           when normalized_status = 'approved' then coalesce(p.approved_at, now())
           else null
         end,
         approved_by = case
           when normalized_status = 'approved' then auth.uid()
           else null
         end,
         updated_at = now()
   where p.id = target_user
   returning p.email, p.role::text into target_email, target_role;

  if target_email is null then
    raise exception 'Member not found';
  end if;

  if normalized_status = 'approved' then
    insert into public.credit_wallet(user_id)
    values (target_user)
    on conflict on constraint credit_wallet_pkey do nothing;
  end if;

  insert into public.admin_audit_log(actor_user_id, target_user_id, action, metadata)
  values (
    auth.uid(),
    target_user,
    case when normalized_status = 'approved' then 'MEMBER_APPROVE' else 'MEMBER_REJECT' end,
    jsonb_build_object('email', target_email, 'role', target_role, 'status', normalized_status)
  );

  return query
    select
      p.id,
      p.email,
      p.display_name,
      p.status::text,
      p.role::text,
      p.support_status
    from public.profiles p
    where p.id = target_user;
end;
$$;

grant execute on function public.ceo_admin_members() to authenticated;
grant execute on function public.ceo_admin_set_member_status(uuid, text) to authenticated;

commit;
