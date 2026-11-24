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

## Status (2026-11-24)

**Production** is seededtennis.com, deployed from `main` (after the
2026-11-22 overnight merges, PRs #36–#45 plus the dead-code sweep and this
docs reorganisation; then #48 the spreadsheet sync, #49 the roster pages,
#50 Herdy's landing overhaul, #51 the consult follow-ups and #52/#53 the UI
fixes, colour directions and school logos, merged 2026-11-23 UTC).
`main` auto-deploys with no staging gate; it is protected (PR + green
`verify`). Return point before the 2026-11-24 overnight changes: tag
`pre-cursor-2026-11-24` (= `83da8b2`).
Small fixes merged that night, one PR each (details in
`archive/ROADMAP_HISTORY.md`): the importer's SQL header says when it carries
player names (#55); the coach email labels an opponent's UTR
"(self-reported)" (#56); tournament entries refuse a cost, travel time or
distance their database column cannot hold (#57); the landing page's "How
fit works" no longer calls every team range an estimate (#58). Left open
for Niran: #59 (the vercel.app alias → seededtennis.com, sign-in path).
New TODO findings: a corrected range keeps its old "Roster checked" date.

- **Database: every repo migration through 054 is on production** (ledger
  56). 053 (`program_details`) and 054 (`program_roster`, `program_staff`)
  were applied 2026-11-23 00:16 and 00:24 UTC on Niran's go, each after a
  fresh backup (`prod-20261123-0005-pre053.dump`,
  `prod-20261123-0023-pre054.dump`). The ledger is the source of truth:
  `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line. Runbook and
  rollbacks: [`HANDOFF.md`](HANDOFF.md) §J (Step 28 is 053, Step 29 is 054).
- **Catalog phase 1 is ON in production, fed by the owner's sheet.**
  `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED=true` on Vercel Production. The
  "College Tennis UTR Database" sheet (63 rated teams: ACC + all of the SEC,
  plus a "Program Info" tab) is on production since 2026-11-23 UTC: 63
  programs with a current range (floor = lower quartile, middle = median of
  reliable singles UTRs on the official roster), 43 Program Info rows, 587
  official-roster players by name and 141 staff (counted 2026-11-24). The
  code merges it into the ONE catalog every screen reads
  (`lib/catalog/merge.ts`): the 22 teams also in the legacy list take the
  sheet's range instead of the estimate, and the other 41 join with their own
  pages. Imported programs reach fit math only through `bandableRange()`
  (`lib/catalog/programs.ts`); the remaining legacy programs still carry
  labelled, unsourced estimates. Rules: [`DATA_QUALITY.md`](DATA_QUALITY.md).
- **Roster pages are live** (PR #49; Niran's decision, DECISIONS
  2026-11-22): each school page lists the official roster by name (class,
  singles UTR linked to the profile it was read from, hometown) and the
  coaching staff with the emails the school publishes. Still open: the
  privacy policy's mention of these names and a takedown path (TODO §5).
- **Staging** has 053 + 054 but only 3 official rosters (27 players, 9
  staff); the full roster import was run on production only, so Preview
  school pages mostly show no roster.
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
- **Landing overhaul, hard-court theme** (branch `herdy-work`, 2026-11-22
  night, merged in PR #50 on 2026-11-23; Figma "WD — NiranRamprasad — Seeded" page 06; no migration): the
  hero and the closing band sit on a fixed court green (`--c-court`, light
  mode's own primary pinned for both modes) with to-scale court lines
  (`components/seeded/court`, Codex); white copy and a white/green CTA; a
  CSS-only bouncing ball in the hero (idle hop paused off-screen) and one
  arcing over a net divider into the parents band; court-corner lines behind
  the features; the product shot on a light court band; scoreboard-numbered
  "How fit works". All motion is off under reduced motion; the ball is
  measured to stay clear of the copy and the calculator card. The desktop
  subhead now uses the mobile wording; since the merge with #48 both lines
  carry its roster qualifier ("a hand-checked roster where we have one, our
  estimate where we don't") and a counted N (`honest-zero-state.test.ts`
  updated deliberately).
- **23 Nov consult follow-ups** (Herdy + Niran; merged in PR #51 on
  2026-11-23; UI only, no migration): the header's "Get my free fit report"
  button is gone ("Fit report" in the links goes to the same page) and Sign
  in is the green button, a plain link on /onboarding beside the
  diagnostic's Continue (rule 1; DECISIONS 2026-11-23); on phones the menu
  is the shared right-hand Drawer (closes on any route change, Esc, tap
  outside, and at desktop width); the footer prints "© <year> Seeded";
  /sample-report ("For parents") sits under the shared header like every
  other public page, its own header now a "Sample report · example family"
  bar. The fit report's projected-UTR card stays text (Niran's call). Open
  consult items: TODO §4 "Consult follow-ups".
- **Eight older UI issues fixed** (Herdy; merged in PR #52 on 2026-11-23; UI
  only, no migration; all were on the live theme). On a phone, "Compare
  side by side" on /schools was under the tab bar and could not be tapped,
  and a parent's confirm-email card covered it. React redrew the whole page
  on 72 of 560 loads on a busy machine (error 418), now 0 of 560. Four
  dialogs bleached the page in dark mode. The cost calculator had a gradient
  pill and glass cards. "Recovery" and "Mental work" were one grey. Five
  boxes used `bg-subtle`, which is not a token, so they had no background.
  The hero ball lost its seams in dark mode. Tests: `app-shell-hydration`,
  `phone-tab-bar-clearance`, `session-colours`, plus new rules in
  `design-system-v2` (`components/cost` is now inside it) and `court-art`.
  Structural calls: DECISIONS 2026-11-23.
- **Colour directions** (Herdy; merged in PR #52 on 2026-11-23; UI only, no
  migration, the live theme is unchanged): three palettes behind a
  preview-only switch, Blue Court picked to show Niran on 27 Nov, measured AA
  on the public and signed-in pages (DECISIONS 2026-11-23). Making it the
  default waits for Niran's OK.
- **School logos** (Herdy; live since PR #52 on 2026-11-23, on Niran's go; no
  migration): the school tile shows a logo where a public-domain file
  exists, 11 of 37 schools so far (`SCHOOL_LOGOS.md`, DECISIONS 2026-11-23).
  Still open: a trademark check, and the repository is public, so the files
  can be downloaded from GitHub.
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

Updated 2026-11-24 (#2 rewritten: the sheet sync and roster pages are on
production). Updated 2026-11-22 from the 2026-11-20 list (kept in
`archive/ROADMAP_HISTORY.md`). Done since then and dropped: migration 051
(on production 2026-11-21), migration 052 (production 2026-11-22), the UTR
database import and the catalog flag (production 2026-11-22), the
`lib/fit.ts` split (2026-11-21), migrations 053 + 054 and the sheet re-import
(production 2026-11-23).

1. **Family follow-ups after 052.** Settings → Family shows who approved
   whom and each parent's home family (`parent_accounts.approved_by` is
   already written; it needs a `family_members()` column, so 038's shape
   test and /privacy's column list change too); decide `deny_family_join()`
   (any member, a player included, may still decline a pending parent).
   Then the decided post-checkout Whop re-check — idempotent, rate-limited,
   never downgrades. TODO "Who may approve a parent joiner", "Post-checkout
   sync never runs".
2. **Catalog: sourced ranges everywhere.** The sheet sync and roster pages
   are live (63 sourced ranges, 053 + 054 on production since 2026-11-23).
   Next: the privacy policy's wording for published roster names plus a
   takedown path (TODO §5 "Roster names: privacy wording and takedown");
   the Big Ten re-import when the sheet has it; full rosters on staging so
   Previews match production; a stale range shown as stale; the owner
   decides UTR licensing (DATA_QUALITY "Second source"); close the phase-1
   follow-ups (importer atomicity, weak source CHECKs — TODO "Catalog phase 1
   follow-ups"). Then structured data on the public school pages.
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
