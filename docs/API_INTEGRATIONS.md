# Seeded — API Routes & Integrations

## Internal routes (`app/api`)
| Route | Method | Auth | Client | Validation | Notes |
|---|---|---|---|---|---|
| `/api/profile` | POST | bearer | request-scoped | zod `PlayerBodySchema` | Accepts `role`/`family_code` — remove (S-1) |
| `/api/utr-entries` | POST | bearer | request-scoped | zod | add outlier flag |
| `/api/matches` | POST | bearer | request-scoped | zod | |
| `/api/outreach` | POST | bearer | request-scoped | zod discriminated union | RLS requires family tier |
| `/api/family/budget`, `/expenses` | POST | bearer | request-scoped | zod | parent-only via RLS |
| `/api/account/deletion` | POST | bearer | request-scoped | zod | soft delete only — no job |
| `/api/training/planner`, `/templates` | POST | bearer | request-scoped | zod | POST-V1 feature |
| `/api/whop/checkout` | POST | bearer | Whop SDK | tier enum | redirect to legacy `/dashboard` |
| `/api/whop/membership` | GET | bearer | service role + Whop | — | trusts `profiles.whop_membership_id` (S-1) |
| `/api/whop/webhook` | POST | Whop signature | service role | SDK unwrap | idempotency guard for stale events — good |

Every route: returns `err.message` on 500 — replace with generic text (S-10).

### Removed (P1-SEC-1, P1-SEC-5)
- **`/api/training/copilot`** (Gemini) — deleted. It was authed-only with no
  tier check, no rate limit and no input cap on a paid provider call, it
  returned raw provider errors to the client, and its prompt instructed the
  model to "make a reasonable default choice" and write training sessions —
  which also broke the "no auto-generated training plans" rule. Deleted with
  `components/training/training-copilot.tsx` and the action-apply handlers in
  `training-view.tsx` that turned model JSON into real session writes.
- **`/api/stripe/{checkout,portal,webhook}`** and `lib/stripe.ts` — deleted.
  Billing is Whop only; these were live endpoints for an unused path. The
  `profiles.stripe_*` columns remain until a cleanup migration — no code
  reads them.
- The `stripe` and `@google/genai` packages were uninstalled, and both key
  families removed from `.env.example`. **Revoke the Gemini key at Google and
  the Stripe secret key in Stripe** — removing the env var does not
  invalidate the credential.

## External
- **Supabase** — Auth + Postgres. Keys: publishable (client), service role (server webhooks only).
- **Whop** — plans `WHOP_PLAN_PLAYER`, `WHOP_PLAN_FAMILY`; webhook events `membership.activated|updated|deactivated` with `metadata.supabase_user_id`. Prices are hardcoded in 3 places (`pricing-view.tsx`, webhook `TIER_PRICE_USD`, `paid-gate.tsx`).
- **GA4** — client tag + Measurement Protocol purchase event on activation.
- ~~**Gemini**~~ — removed (P1-SEC-1). V1 ships no AI feature. Any future one
  must meet the AI rules in `/CLAUDE.md` before it goes back in.
- ~~**Stripe**~~ — removed (P1-SEC-5). Whop is the only billing path.
- **Gmail** — compose URL only (`https://mail.google.com/mail/?view=cm&to=…`). Never the API. Never auto-send.
- **UTR** — profile link stored, never fetched.
