# Seeded: Master Roadmap

Where things stand, what blocks launch, and the next ten tasks.
Read [`/CLAUDE.md`](../CLAUDE.md) first.

- Open work, all of it: [`TODO.md`](TODO.md)
- History (dated log, old audits): [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md)
- The long version of this page (2026-11-24): [`archive/MASTER_ROADMAP_2026-11-24.md`](archive/MASTER_ROADMAP_2026-11-24.md)
- Why a call was made: [`DECISIONS.md`](DECISIONS.md)
- Ideas for after launch: [`GROWTH.md`](GROWTH.md)

**Rule:** when you finish, find or change something, update this file in the
same commit and add a dated entry at the top of `archive/ROADMAP_HISTORY.md`.
Status lines are claims about live systems. Re-check the source each one names.

---

## Status (2026-11-27)

- **Week of 2026-11-24:** Herdy is the main developer. Niran is away.
- **Production** is seededtennis.com, deployed from `main`. Everything through
  PR #61 is live. Gate was green on 2026-11-24 (170 test files, 2,744 tests).
- **Database:** every migration through 054 is on production. Check
  `list_migrations` on `tfpjssmhiptbwigarxpx`, not this line. Runbook:
  [`HANDOFF.md`](HANDOFF.md) §J.
- **Catalog:** phase 1 is on in production, fed by the owner's College Tennis
  UTR Database sheet.
  - 63 teams (ACC and SEC) with a sourced range: floor = lower quartile,
    middle = median of reliable singles UTRs on the official roster.
  - 43 Program Info rows, 587 roster players, 141 staff (counted 2026-11-24).
  - 22 legacy schools take the sheet's range. 41 join with their own pages.
  - Other legacy programs still carry labelled, unsourced estimates.
  - Rules: [`DATA_QUALITY.md`](DATA_QUALITY.md).
- **Roster pages are live:** class and singles UTR, plus staff with the emails
  each school publishes. Since `feat/plan-utr-fit-reframe` (2026-11-27, not
  merged yet): a college player's UTR shows only as its whole number
  ("12.xx") with a link-out button to their UTR profile, the exact rating is
  cut on the server, and Hometown is gone. The exact ratings are still
  readable through the public database API until a follow-up migration
  closes `program_roster.utr` (TODO §2). Team floors, middles and tops are
  whole numbers on screen too, but exact in the page source (TODO §2). Still open: the privacy policy's
  wording for these names, and a takedown path (TODO §5).
- **Plan UTR and fit wording (branch `feat/plan-utr-fit-reframe`, not merged
  yet):** one stored Plan UTR (`planGoalUtr`, no migration) judges fit on
  Schools, Plan, Today, school pages and the tournament checker. It replaced
  the "what if" slider. /plan shows quarterly checkpoints and one realism
  note. The 1.5-a-year banners are gone from /plan and /today. Tiers are
  named Safe bet / Good match / Stretch / Long shot (Niran, 2026-11-27), and
  "band" is gone from every screen. See DECISIONS 2026-11-27.
- **Staging** (`gnlcpnsweqbtwpaqhqqg`) has the same schema but only 3 official
  rosters, so Preview school pages mostly show no roster. Local dev and Preview
  read it.
- **UI:** design polish rounds 1 and 2, the hard-court landing page, school
  logos (11 of 37 schools) and the other UI fixes from 22–23 Nov are merged.
  Three colour directions sit behind a preview-only switch. "Blue Court" is the
  pick to show Niran on 27 Nov. Making it the default waits for his OK.
- **Sign-in and domain:** every `*.vercel.app` production name now redirects to
  seededtennis.com (#59).
- **Monitoring:** sanitised server logs, `/api/health` and an hourly uptime
  check. Nothing alerts yet.
- **Branches:** GitHub holds `main`, Herdy's `herdy-work` and `herdy-colours`,
  and docs branches. Never touch Herdy's.

## Open blockers

Before a public launch or taking real money. Detail in [`TODO.md`](TODO.md).

1. **Privacy policy not reviewed by an adult or lawyer.** COPPA parental
   consent is the central question.
2. **Production checkout never run end to end.** The $0 promo test
   (HANDOFF §K) is Niran's. The post-checkout Whop re-check is decided, not
   built.
3. **No alerting.** Errors are logged and uptime is checked, but nobody is
   paged.
4. **Parent emails may not arrive.** Production SMTP and a real Google verify
   test are unchecked. Seeded sends no other email.
5. **Plan settings before real money:** Supabase and Vercel Pro (auth rate
   limits and leaked-password protection are plan settings, not code). Revoke
   the old Gemini and Stripe keys at the provider.

Known and accepted, not blockers:
- A player can still create a fake first parent (migration 052's residual risk).
- `Player.currentUTR` uses an in-memory `0` for "no rating". It is guarded by
  `lib/utr-sentinel.test.ts` (NEXT 10 #3).

---

## NEXT 10 TASKS

Updated 2026-11-27. Previous lists are in `archive/ROADMAP_HISTORY.md`.

1. **Ship `feat/plan-utr-fit-reframe`, then close the roster read.** Merge on
   Niran's go after CI and the Preview check. Then a migration that stops
   `anon`/`authenticated` reading `program_roster.utr` (the page already only
   receives the whole number; the server reader needs a definer function or
   server-only key first). Parents still see fit on the estimate: the Plan
   UTR lives in the player's own `user_settings` (TODO §4).
2. **Family follow-ups.**
   - Settings → Family shows who approved whom and each parent's home family.
     This needs a new `family_members()` column, so 038's shape test and
     `/privacy`'s column list change too.
   - Decide `deny_family_join()`.
   - Then build the post-checkout Whop re-check: idempotent, rate-limited, never
     downgrades.
3. **Catalog: sourced ranges everywhere.**
   - Privacy wording for published roster names, plus a takedown path.
   - Big Ten re-import when the sheet has it.
   - Full rosters on staging so Previews match production.
   - Show a stale range as stale.
   - Owner decides UTR licensing (DATA_QUALITY "Second source").
   - Close the phase-1 follow-ups (importer atomicity, weak source CHECKs).
   - Then structured data on public school pages.
4. **`Player.currentUTR: number | null`.** Removes the `0` sentinel (139 uses in
   38 non-test files, counted 2026-11-21).
5. **UI revamp, one screen per PR.** Open: SeededCard/Pill primitives, the cuts in
   [`COPY_CUTS.md`](COPY_CUTS.md), signup field order, the family page, a visual
   check. The Figma file (DECISIONS 2026-11-22) beats
   [`DESIGN_MOCKUP_SPEC_V2.md`](DESIGN_MOCKUP_SPEC_V2.md) where they differ.
6. **AI goal coach.** Player goals become year, month and week goals. V1 ships no
   AI. It needs its own privacy-policy section first.
7. **Wire the recruiting checklist into Today.**
8. **Parent email delivery.** Check production SMTP and do a real Google verify
   test. "Verify with Google instead" works only when
   `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is exactly `true`, the Google provider is
   set up in that Supabase project, and the Google address matches.
9. **Weekly email.** Needs a real sending path first. Copy must not promise it
   before then.
10. **File splits:** `lib/auth.ts`, the schools browser, `signup-flow.tsx`, the
   Today layout (see [`REVIEWER_GUIDE.md`](REVIEWER_GUIDE.md) §9).
    Alerting (was #10) moves to the list after this one: choose a Vercel log
    drain or Sentry (Niran), then alert on error lines and on the uptime check.

Owner-only steps (dashboards, keys, decisions) are at the top of
[`TODO.md`](TODO.md).
