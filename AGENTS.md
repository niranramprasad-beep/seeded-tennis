# Seeded — notes for Codex and other agents

**Read [`CLAUDE.md`](CLAUDE.md) first.** It is the rulebook and the current
status (branches, migrations on each Supabase project, open blockers, the
non-negotiable product rules). This file only adds what an agent is most
likely to get wrong.

## Standing gotchas

- **Local dev reads STAGING, not production.** `.env.local` points at the
  staging Supabase project (`gnlcpnsweqbtwpaqhqqg`), which Vercel Preview and
  Development also read. Production (`tfpjssmhiptbwigarxpx`) is read-only for
  agents unless the owner signs off on a specific change in the current turn.
  Re-check `.env.local` yourself before signing in through real auth; staging
  accounts are fake (`fake-*@example.com`, see `docs/STAGING_PERSONAS.md`).
- **Prices live only in `TIER_PRICE_USD` in `lib/types.ts`.** The pricing
  page (`components/pricing/pricing-data.ts`), `PaidGate`, billing views and
  the Whop webhook's GA4 purchase value (`app/api/whop/webhook/route.ts`,
  via `lib/whop.ts`) all import it. Never retype a price in a component.
  The legacy Whop plans (`WHOP_PLAN_PLAYER` / `WHOP_PLAN_FAMILY`) are
  resolve-only; see `lib/whop.ts` and CLAUDE.md "BILLING".
- **`main` auto-deploys to seededtennis.com** with no staging gate. It is
  protected (PR plus a green `verify` check). Never push or merge to it, or
  apply a migration, without the owner's explicit sign-off.
- Before claiming something works:
  `rm -rf .next && npx tsc --noEmit && npm run lint && npx vitest run`.

## Done (kept so nobody re-does it)

- *Separate Supabase dev project* — done 2026-11-14/15. Staging exists, is a
  schema clone of production, and is what local dev and Vercel Preview use.
