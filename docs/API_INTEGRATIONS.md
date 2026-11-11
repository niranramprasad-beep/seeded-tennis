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
| `/api/training/copilot` | POST | bearer | Gemini | partial | **remove for V1** (S-4) |
| `/api/whop/checkout` | POST | bearer | Whop SDK | tier enum | redirect to legacy `/dashboard` |
| `/api/whop/membership` | GET | bearer | service role + Whop | — | trusts `profiles.whop_membership_id` (S-1) |
| `/api/whop/webhook` | POST | Whop signature | service role | SDK unwrap | idempotency guard for stale events — good |
| `/api/stripe/*` | POST | bearer / signature | Stripe | — | dead path — remove (S-8) |

Every route: returns `err.message` on 500 — replace with generic text (S-10).

## External
- **Supabase** — Auth + Postgres. Keys: publishable (client), service role (server webhooks only).
- **Whop** — plans `WHOP_PLAN_PLAYER`, `WHOP_PLAN_FAMILY`; webhook events `membership.activated|updated|deactivated` with `metadata.supabase_user_id`. Prices are hardcoded in 3 places (`pricing-view.tsx`, webhook `TIER_PRICE_USD`, `paid-gate.tsx`).
- **GA4** — client tag + Measurement Protocol purchase event on activation.
- **Gemini** — copilot only.
- **Gmail** — compose URL only (`https://mail.google.com/mail/?view=cm&to=…`). Never the API. Never auto-send.
- **UTR** — profile link stored, never fetched.
