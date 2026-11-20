# Seeded — API Routes & Integrations

Current as of 2026-11-20 (13 `route.ts` files under `app/api`).

## Internal routes (`app/api`)

Every route except the webhook needs a Supabase bearer token. "Request-scoped"
= an anon-key client carrying that token, so RLS applies
(`lib/api-auth.ts`). Rate limits are enforced in Postgres by a trigger on the
table (migration 034); the routes only peek so they can answer 429 first.

| Route | Method | Client | Validation | Notes |
|---|---|---|---|---|
| `/api/profile` | POST | request-scoped | zod `PlayerBodySchema` | Body carries `role`/`familyCode` for shape, but the database refuses any change to privileged columns (022 trigger, 42501). Free accounts capped at 3 targets (024/040) |
| `/api/utr-entries` | POST | request-scoped | zod | Self-reported UTR; range 1–16.5 enforced by a DB CHECK |
| `/api/matches` | POST | request-scoped | zod | Parents refused (`refuseParentPlayerDataWrite`) |
| `/api/outreach` | POST | request-scoped | zod discriminated union | Parents refused; RLS needs `has_tier('player')` |
| `/api/training/sessions` | POST | request-scoped | zod | The player's manual calendar only; parents refused |
| `/api/family/budget`, `/api/family/budget/expenses` | POST | request-scoped | zod | `refuseUnlessFamilyPlan()`; RLS: parent role + approved member (050) + Family plan (042) |
| `/api/account/deletion` | POST | request-scoped | zod | Calls `delete_my_account()` (029) — deletes the caller only |
| `/api/account/export` | GET | request-scoped | — | Full JSON export; a test fails the build when a table is neither exported nor excluded with a reason |
| `/api/whop/checkout` | POST | request-scoped + Whop SDK | zod | Return URL pinned to the site / preview origin, never a request header (S-11) |
| `/api/whop/sync` | POST | request-scoped, then service role | — | Post-checkout sync of the buyer's membership |
| `/api/whop/membership` | GET | service role (caller's own row by id) + Whop | — | Read-only; never reads another user's profile |
| `/api/whop/webhook` | POST | service role | Whop signature (`unwrapWebhook`) | Ignores stale/out-of-order events |

**Open (S-10):** six routes — profile, utr-entries, matches, outreach,
family/budget, family/budget/expenses — still return the raw Postgres error
text on a 500. Export, deletion and training do not.

Removed: `/api/training/copilot` (Gemini), `/api/training/planner`,
`/api/training/templates`, `/api/stripe/*`. History:
`docs/MASTER_ROADMAP.md` (P1-SEC-1, P1-SEC-5) and CLAUDE.md (no
auto-generated training plans).

## External
- **Supabase** — Auth + Postgres. Publishable/anon key in the browser;
  service-role key on the server only (the three Whop routes).
- **Whop** — the only billing provider. Prices live only in
  `TIER_PRICE_USD` (`lib/types.ts`): Player $12/mo or $99/yr, Family $19/mo
  or $159/yr. Plan ids come from `WHOP_PLAN_*` env vars (`lib/whop.ts`); the
  legacy `WHOP_PLAN_PLAYER` / `WHOP_PLAN_FAMILY` plans are resolve-only.
  Webhook events `membership.activated|updated|deactivated`
  (`lib/whop-payload.ts`). Dashboard-side webhook setup is the owner's —
  `docs/HANDOFF.md` §K.
- **GA4** — client tag in production, plus a Measurement Protocol purchase
  event from the webhook on activation (`lib/ga4-server.ts`).
- **Gmail** — compose URL only (`https://mail.google.com/mail/?view=cm…`).
  Never the API, never inbox access, never auto-send.
- **UTR** — the player's profile link is stored and shown. Never fetched or
  scraped.
- **No AI provider, no Stripe, no email/push sender.** Seeded sends no email
  or notifications. The old Gemini and Stripe keys still need revoking at the
  provider (CLAUDE.md).
