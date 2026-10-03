-- Real subscription billing via Stripe. Tier was previously a client-only
-- localStorage toggle with no server-side source of truth — this adds one.
-- subscription_tier defaults to 'free' and is only ever changed by the
-- Stripe webhook (checkout completed / subscription updated / canceled).

alter table public.profiles
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'player', 'family')),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);
