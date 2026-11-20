# Seeded — Product Spec (V1)

Current as of 2026-11-20. Rules and status live in `CLAUDE.md`; the task
list is `docs/MASTER_ROADMAP.md`.

## One sentence
Seeded tells a junior tennis player which college teams they can
realistically make and what to do this month to close the gap — with a
read-only view for parents.

## Users
- **Player** — primary account. Under 13: a parent creates/approves the
  account and it stays inert until an adult in the family consents.
- **Parent** — joins a family with its code, lands pending until an
  approved member approves, and must verify their email first. Read-only
  except two things: the season budget (and its expenses) and encouragement
  notes.

## Core loop
Log UTR → see fit bands against team ranges → pick targets → track coach
outreach → parent sees progress.

## Navigation
Five primary items: Today, Plan, Schools, Outreach, Events. A secondary
"Tools" group: Results, Tournament checker. Settings and Family sit under the
avatar menu.

## V1 features and their honest status
| Feature | Status | Gap |
|---|---|---|
| Signup / login / reset (email + Google) | Works | Auth rate limits and leaked-password protection are Supabase project settings, not app code |
| Onboarding + under-13 consent | Enforced in the database (030) | No adulthood verification exists or is claimed |
| School catalog | 68 programs, mostly upper D1; UTR ranges labelled "Unverified estimate" | Sourced ranges + wider coverage: PR E (migration 048, staging only) |
| Fit bands (Likely / Target / Reach / Out of range) | One code path; plans with `min(own pace, 1.5/yr)` | Only as good as the catalog ranges |
| Plan (UTR history, trajectory) | Works | No outlier flag on self-reported entries |
| Schools browse + detail, targets | Works; Free capped at 3 targets | — |
| Outreach tracker + coach email draft | Works (Player tier). Every sentence traces to the player's own data; Copy/Gmail stay disabled while any `[ ]` placeholder remains | — |
| Family view, roster, budget, notes | Works. Approval flow; Family plan unlocks one family, max 4 players + 2 parents; only parents write the budget (050); leave family (046) | Any approved member can approve a parent joiner (`docs/TODO.md`) |
| Billing (Whop) | Checkout and sync work in code | Webhook dashboard setup is the owner's — `docs/HANDOFF.md` §K |
| Account deletion + data export | Real deletion (`delete_my_account()`) and a full JSON export | Privacy policy still needs adult/lawyer review |
| Tournament checker | Works, public; needs the draw's average UTR | — |
| Events (tournaments, results, manual training calendar) | Works; tournament status includes Planning/Entered/Played | — |
| Check-ins | Works (`/today/check-ins`) | — |

**Removed, product-wide:** AI copilot, auto-generated training plans and
templates, Match mode, friends, badges, notification toggles, the public
recruiting page, the invented "12 tournaments" goal. Seeded sends no email
or notifications.

**Post-V1 (not built):** transfer portal, similar players, probability,
commitments, openings.

## Product rules (non-negotiable)
See `CLAUDE.md`. Short version: no invented data; bands not percentages;
"leaving" counts, never "open spots"; Gmail compose link only; UTR is a
profile link + manual entry only; parents write only the budget and notes.

## Pricing
Prices live only in `TIER_PRICE_USD` (`lib/types.ts`):
Free $0 · Player $12/mo or $99/yr · Family $19/mo or $159/yr. Older
subscribers on the legacy $19/$39 plans keep resolving to their tier.
Player unlocks outreach and training-calendar writes (and lifts the 3-target
cap); Family unlocks cross-member reads, the budget, notes and reports for
the payer's home family.
