# Seeded — MASTER ROADMAP

The one current roadmap: where things stand, what blocks a public launch,
and the next ten tasks in order. Read [`/CLAUDE.md`](../CLAUDE.md) first.

- **Open work, all of it:** [`TODO.md`](TODO.md). This file only orders it.
- **How we got here** (every dated status entry since 2026-11-10, the
  2026-11-10 audit's P0–P3 lists, the previous NEXT 10):
  [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md).
- **Why a call was made:** [`DECISIONS.md`](DECISIONS.md).

Rule: when you finish, find or change something, update this file in the
same commit — the status lines below, the blockers, NEXT 10 — and add a
dated entry at the top of `archive/ROADMAP_HISTORY.md`'s log. Status lines
here are claims about live systems; re-check the live source each one names
before relying on it.

---

## Status (2026-11-22)

**Production** is seededtennis.com, deployed from `main` (after the
2026-11-22 overnight merges, PRs #36–#45 plus the dead-code sweep and this
docs reorganisation).
`main` auto-deploys with no staging gate; it is protected (PR + green
`verify`).

- **Database: every repo migration through 052 is on production.** 052 (only
  a parent of the family approves or removes another parent) was applied
  2026-11-22 on Niran's go, after a fresh backup, and its 35-case probe was
  re-run there in a rolled-back transaction. The ledger is the source of
  truth: `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line.
  Runbook and rollbacks: [`HANDOFF.md`](HANDOFF.md) §J (Step 27 is 052).
- **Catalog phase 1 is ON in production.** The owner's "College Tennis UTR
  Database" was imported to production on 2026-11-22 (35 programs, 135
  class-count rows, 34 hand-curated ACC/SEC team ranges; floor = lower
  quartile, middle = median), checksum-identical to staging, and
  `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED=true` is set on Vercel Production.
  Imported programs reach fit math only through `bandableRange()`
  (`lib/catalog/programs.ts`); the 68 legacy catalog programs still carry
  labelled, unsourced estimates. Rules: [`DATA_QUALITY.md`](DATA_QUALITY.md).
- **Design polish round 1 is merged** (PR #37, `herdy-work`, from the
  2026-11-22 consult with Herdy): band icons on fit badges, a clear active
  nav state, the yearly-price strikethrough derived from `TIER_PRICE_USD`,
  the percent beside a UTR change, tinted landing cards, school initials
  tiles. Palette unchanged; reference is the Figma file named in
  DECISIONS 2026-11-22. One design system; Appearance = Light / Dark / Match
  system.
- **Clean deploys** (PR #38, `fix/herdy-vercel-warnings`): `engines.node`
  is `24.x` (matches `.nvmrc`, CI and Vercel; Vercel had been building on
  Node 26), `npm run lint` is the ESLint 9 CLI (`eslint . --max-warnings=0`,
  flat `eslint.config.mjs`; `next lint` is gone), the OG image is a static
  build-time PNG, and no build warning we own remains.
- **Herdy's 22 Nov action items are merged** (PRs #39–#45): Google sign-in
  paths (the `/?code=` fallback now reaches `/auth/callback`; specific
  error messages; parent/player intent through OAuth), profile form order
  (role → country → team → grade → year born, grade filters birth years),
  "Add to calendar" `.ics` downloads, one active-page rule for every nav,
  no fake clickable affordances, percent-first comparisons, one fit-band
  pill component, landing layout and logo fixes. Still needs a real Google
  sign-in test by Niran (TODO).
- **Design polish round 2** (branch `herdy-work`, 2026-11-22 evening; no
  migration, palette unchanged): the remaining `COPY_CUTS.md` cuts on the
  sidebar, pricing, Schools and the school page (honesty labels shortened,
  never cut; pinned tests updated deliberately); static status pills use the
  shared `Pill`; the family page gets icon KPI tiles, one read-only pill, the
  computed season as its eyebrow, the over-budget state said twice not three
  times, shorter empty states, and a skeleton the same height as the cards;
  sections fade up as they scroll in, CSS only (`.seeded-reveal`, nothing
  hidden waiting for JavaScript, off under reduced motion); the sample
  report offers a signed-in visitor "Back to Today/Family" instead of a
  sign-up. Still open: the parent dashboard upgrade (TODO §4), a real
  signed-in visual check on staging.
- **Staging** `gnlcpnsweqbtwpaqhqqg` has the same schema plus rehearsal
  re-runs in its ledger. Local dev (`.env.local`) and Vercel Preview read it.
- **Monitoring, part 1 only:** sanitised server logs, `/api/health`, an hourly
  uptime workflow. Nothing alerts yet.

## Open blockers

Before a public launch or taking real money. Each one's detail is in
[`TODO.md`](TODO.md).

1. **The privacy policy has not been reviewed by an adult or a lawyer**
   (P0-8's other half; COPPA's "verifiable parental consent" is the central
   question). TODO "What a lawyer has to check before launch".
2. **Production checkout has never been run end to end by us.** The $0
   promo test (HANDOFF §K) is Niran's; until it passes, checkout → webhook →
   tier on production is unproven. The post-checkout Whop re-check is
   decided but not built (TODO "Post-checkout sync never runs").
3. **No alerting.** Errors are logged, uptime is checked hourly, nobody is
   paged (NEXT 10 #10).
4. **Parent emails may not arrive.** Production SMTP and a real Google
   verify test are unchecked (NEXT 10 #7). Seeded sends no other email.
5. **Plan settings before real money:** Supabase and Vercel Pro (Auth rate
   limits and leaked-password protection are plan settings, not code);
   revoke the old Gemini and Stripe keys at the provider.

Known and accepted, not blockers: a player can still create a fake *first*
parent (052's residual risk, DECISIONS 2026-11-21); `Player.currentUTR`
uses an in-memory `0` sentinel, guarded by `lib/utr-sentinel.test.ts`
(NEXT 10 #3).

---

# NEXT 10 TASKS

Updated 2026-11-22 from the 2026-11-20 list (kept in
`archive/ROADMAP_HISTORY.md`). Done since then and dropped: migration 051
(on production 2026-11-21), migration 052 (production 2026-11-22), the UTR
database import and the catalog flag (production 2026-11-22), the
`lib/fit.ts` split (2026-11-21).

1. **Family follow-ups after 052.** Settings → Family shows who approved
   whom and each parent's home family (`parent_accounts.approved_by` is
   already written; it needs a `family_members()` column, so 038's shape
   test and /privacy's column list change too); decide `deny_family_join()`
   (any member, a player included, may still decline a pending parent).
   Then the decided post-checkout Whop re-check — idempotent, rate-limited,
   never downgrades. TODO "Who may approve a parent joiner", "Post-checkout
   sync never runs".
2. **Catalog: sourced ranges everywhere.** Phase 1 is on with 34 sourced
   ranges. Left: the owner decides UTR licensing (DATA_QUALITY "Second
   source"); replace the 15 legacy estimates the imported programs
   duplicate; close the phase-1 follow-ups the flag went on with (importer
   atomicity, `programs.head_coach` readable by anon, weak source CHECKs —
   TODO "Catalog phase 1 follow-ups"). Then public SEO school pages, once
   their ranges are sourced.
3. **`Player.currentUTR: number | null`** — remove the `0` sentinel (139
   uses in 38 non-test files, re-measured 2026-11-21);
   `lib/utr-sentinel.test.ts` keeps it safe meanwhile.
4. **UI revamp, one screen per PR** (decided 2026-11-21). Round 1 of the
   polish is merged; open from it: SeededCard/Pill primitives and their
   migration, the copy cuts in [`COPY_CUTS.md`](COPY_CUTS.md), signup field
   order, the family page, the sample-report header when signed in, section
   motion, a visual check. References: the Figma file (DECISIONS
   2026-11-22) wins over [`DESIGN_MOCKUP_SPEC_V2.md`](DESIGN_MOCKUP_SPEC_V2.md)
   where they differ.
5. **AI goal coach** — a player's goals → year/month/week goals (Claude API).
   V1 ships no AI; this needs its own privacy-policy section first, and the
   AI rules in `archive/ROADMAP_HISTORY.md` "AI tasks".
6. **Wire the recruiting checklist into Today.** (Open from final-check PR B:
   B1/B2/B9/B15/B23 are Niran's flags; A15 belongs with the write routes.)
7. **Parent email delivery** (final-check PR D): check production SMTP and
   do a real Google verify test. Until then the emailed link may never
   arrive. "Verify with Google instead" works only when
   `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is exactly "true" AND the Google
   provider is configured in that Supabase project (on for production, off
   for staging/Preview), and only for a Google account with the SAME
   address. Then the profile-less auth users it can leave (TODO "Verify with
   Google instead").
8. **Weekly email** — needs a real sending path (none exists; "Remind them"
   only re-sorts). Copy must not promise it before then.
9. **File splits**: `lib/auth.ts`, the schools browser, `signup-flow.tsx`,
   the Today layout (boundaries in [`REVIEWER_GUIDE.md`](REVIEWER_GUIDE.md)
   §9). `lib/fit.ts` is done (`lib/fit/*.ts`, a barrel).
10. **Observability, part 2** — decide Vercel log drain vs Sentry (Niran),
    then alert on `"level":"error"` lines and on the uptime workflow.

Owner-only steps (dashboards, keys, decisions — not code) are listed at the
top of [`TODO.md`](TODO.md).
