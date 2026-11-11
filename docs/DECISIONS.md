# Seeded — Decisions Log

Format: date · decision · why · status. Older decisions are in
`docs/HANDOFF.md` §F and still stand unless overridden here.

- **2026-11-10 · V1 scope cut to the recruiting core.** Training calendar, copilot, notifications, weekly emails, public recruiting page, transfer portal and probability features are POST-V1. Why: each is either unbacked by real data or adds attack surface before the core is honest. Status: proposed — needs owner sign-off.
- **2026-11-10 · Legacy design system will be removed, not maintained.** Why: it doubles every screen and keeps the copilot, `/coaches` and `/training` alive. Status: proposed.
- **2026-11-10 · Privileged profile columns are server-only.** `subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*` change only via service role or dedicated RPCs. Migration 022 drafted. Status: proposed — needs sign-off.
- **2026-11-10 · Coach contact info is never stored or generated.** Link the school's staff directory; the player types the recipient. Why: invented emails reached the UI and drafts. Status: **IMPLEMENTED** (P0-3) — fields deleted from `School`; recipient is a validated user-typed input; `schools-catalog-honesty.test.ts` guards re-add.

## 2026-11-10 — Staff directory is a web search, not a stored or guessed URL
**Context:** P0-3 removed `recruitingPageUrl` (68 × `https://example.com/...`).
The school detail and outreach composer still need to get a player to the real
coaching staff. The obvious replacement is to construct the athletics URL —
`gostanford.com/sports/mens-tennis/coaches` or similar.
**Decision:** Link a web search for `"{school name} {men's|women's} tennis staff
directory"` (`staffDirectorySearchUrl`). Store nothing per school.
**Alternatives considered:** (a) store a real per-school staff URL — correct but
needs 68 × manual verification and ongoing maintenance as athletics sites
rearrange, and it belongs with the P1-DATA-1 import, not ahead of it;
(b) construct the URL from a domain pattern — this is inventing data with extra
steps: patterns differ per school and a confidently wrong link pointing at
another program is worse than no link.
**Reason:** A guessed URL is invented data. A search result is something the
player evaluates themselves, and it degrades honestly when the site moves.
**Consequences:** One extra click for the user. If P1-DATA-1 imports verified
staff pages with a source and date, swap the href at the two call sites and
delete the helper.

## 2026-11-10 — Unverified roster numbers get labeled, not removed or "fixed"
**Context:** `avgRosterUTR`/`minCompetitiveUTR` have no source or date, but
unlike the coach fields they are load-bearing: the four fit bands, the Plan
projection and the school detail range bar are all computed from them.
**Decision:** Keep the numbers exactly as they are and render
`UTR_RANGE_SOURCE_LABEL` ("Unverified estimate") wherever they appear.
**Alternatives considered:** (a) delete them like the coach fields — would leave
the product with no fit model at all, i.e. no product; (b) replace them with
better-researched estimates — still unsourced, and a more plausible invented
number is more dangerous, not less.
**Reason:** The harm in P0-3 was presenting invention as fact. Labeling removes
the false claim without pretending we can fix the data in a copy change.
**Consequences:** The label stays on every roster number until P1-DATA-1 lands
real sourced rows; at that point `UTR_RANGE_SOURCE_LABEL` becomes a per-school
source + date string rather than a constant.
- **2026-11-10 · Fit bands must come from one function with one projection input.** No screen may call `classifySchoolFit` without a projection that can produce "out-of-range". Status: proposed.
- **2026-11-10 · Staging Supabase before any further migration.** Status: proposed.
