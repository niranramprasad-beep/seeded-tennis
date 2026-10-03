-- Whop billing, alongside the dormant Stripe columns from 007 — only one
-- provider is actually wired into the Pricing page at a time, but both can
-- coexist in the schema without conflict. subscription_tier itself is
-- shared and already provider-agnostic.

alter table public.profiles
  add column if not exists whop_membership_id text;
