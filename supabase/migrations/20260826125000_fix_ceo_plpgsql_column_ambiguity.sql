-- Hotfix: remove PL/pgSQL output-column ambiguity in Ceo membership RPCs.
-- This migration changes functions only; it does not modify users, passwords,
-- profiles, wallet balances, support licenses, or transaction rows.

begin;

create or replace function public.ceo_initialize_member()
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_status text,
  account_role text,
  support_status text,
  support_plan text,
  credit_balance bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.status::text into profile_status
    from public.profiles p where p.id = auth.uid();
  if profile_status is null then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;

  if profile_status = 'approved' then
    insert into public.credit_wallet(user_id)
    values (auth.uid())
    on conflict on constraint credit_wallet_pkey do nothing;
  end if;

  return query select * from public.ceo_member_snapshot();
end;
$$;

create or replace function public.ceo_admin_generate_support(search_email text)
returns table (user_id uuid, email text, support_key text, license_status text, support_plan text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
  normalized text := lower(btrim(search_email));
  raw_key text;
  fingerprint text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Approved admin required' using errcode = '42501';
  end if;
  select * into target from public.profiles p
   where lower(btrim(p.email)) = normalized limit 1;
  if target.id is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if target.status <> 'approved' then
    raise exception 'Account is not approved' using errcode = '42501';
  end if;

  raw_key := public.ceo_support_key(normalized, 1);
  fingerprint := encode(extensions.digest(convert_to(raw_key, 'utf8'), 'sha256'), 'hex');
  insert into public.support_licenses(user_id, normalized_email, key_fingerprint, key_version, issued_by)
  values (target.id, normalized, fingerprint, 1, auth.uid())
  on conflict on constraint support_licenses_user_id_key do update
    set normalized_email = excluded.normalized_email,
        key_fingerprint = excluded.key_fingerprint,
        key_version = excluded.key_version,
        issued_by = coalesce(public.support_licenses.issued_by, excluded.issued_by);

  insert into public.admin_audit_log(actor_user_id, target_user_id, action, metadata)
  values (auth.uid(), target.id, 'SUPPORT_GENERATE', jsonb_build_object('key_version', 1));

  return query
    select target.id, target.email, raw_key, l.status, l.plan
      from public.support_licenses l where l.user_id = target.id;
end;
$$;

create or replace function public.ceo_credit_apply(
  target_user uuid,
  signed_amount bigint,
  tx_type text,
  tx_reason text,
  request_key text,
  actor uuid
)
returns table (balance bigint, unlimited boolean, repeated boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance bigint;
  prior_balance bigint;
  is_unlimited boolean;
begin
  if coalesce(btrim(request_key), '') = '' then raise exception 'Idempotency key required'; end if;
  select t.balance_after into prior_balance from public.credit_transactions t
   where t.user_id = target_user and t.idempotency_key = request_key;
  if found then return query select prior_balance, false, true; return; end if;

  select exists(select 1 from public.support_licenses l where l.user_id = target_user and l.status = 'ACTIVE')
    into is_unlimited;
  if is_unlimited and signed_amount < 0 then
    select coalesce(w.balance,0) into current_balance from public.credit_wallet w where w.user_id = target_user;
    return query select coalesce(current_balance,0), true, false; return;
  end if;

  insert into public.credit_wallet(user_id)
  values (target_user)
  on conflict on constraint credit_wallet_pkey do nothing;

  select w.balance into current_balance
    from public.credit_wallet w
   where w.user_id = target_user
   for update;

  if current_balance + signed_amount < 0 then
    raise exception 'Insufficient credit' using errcode = '22003';
  end if;

  update public.credit_wallet as w
     set balance = w.balance + signed_amount,
         total_earned = w.total_earned + greatest(signed_amount, 0),
         total_spent = w.total_spent + greatest(-signed_amount, 0),
         updated_at = now()
   where w.user_id = target_user
   returning w.balance into current_balance;

  insert into public.credit_transactions(user_id, amount, transaction_type, reason, balance_after, idempotency_key, actor_user_id)
  values (target_user, signed_amount, tx_type, coalesce(tx_reason,''), current_balance, request_key, actor);
  return query select current_balance, false, false;
end;
$$;

grant execute on function public.ceo_initialize_member() to authenticated;
grant execute on function public.ceo_admin_generate_support(text) to authenticated;
revoke all on function public.ceo_credit_apply(uuid, bigint, text, text, text, uuid) from public, anon, authenticated;

commit;
