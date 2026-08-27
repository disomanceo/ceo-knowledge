-- Increase Ceo test credits to 100 and restore exhausted member wallets once.
-- Support Unlimited accounts are intentionally excluded from the reset.

alter table public.credit_wallet alter column balance set default 100;
alter table public.credit_wallet alter column total_earned set default 100;

with targets as (
  select w.user_id
  from public.credit_wallet w
  where w.balance <= 0
    and not exists (
      select 1
      from public.support_licenses s
      where s.user_id = w.user_id
        and s.status = 'ACTIVE'
        and s.plan = 'UNLIMITED'
    )
), updated as (
  update public.credit_wallet w
     set balance = 100,
         total_earned = w.total_earned + 100,
         updated_at = now()
    from targets t
   where w.user_id = t.user_id
  returning w.user_id, w.balance
)
insert into public.credit_transactions(
  user_id, amount, transaction_type, reason, balance_after, idempotency_key, actor_user_id
)
select
  u.user_id,
  100,
  'ADMIN_GRANT',
  'Testing reset: Ceo trial increased to 100 credits',
  100,
  'testing-credit-reset-100-20260827',
  null
from updated u
on conflict (user_id, idempotency_key) do nothing;
