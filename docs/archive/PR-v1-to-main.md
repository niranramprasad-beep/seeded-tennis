# PR: v1 → main

**Title:** Seeded V1: honest data, family privacy enforced in the database, and the maintenance page removed

**Merge only after** the 18 migrations in `docs/archive/GO-SEQUENCE.md` §3 are applied
to production and verified. The code calls RPCs and relies on policies that
do not exist on production until then.

---

## What this is

99 commits from `v1` (440 files) that have been running on staging and on
Vercel Preview (which reads staging). Merging removes the maintenance page:
`main` was merged into `v1` (`0cea97e`) and `middleware.ts` deleted on `v1`
in the commit after it — a plain merge of `v1` without that deletion kept
the 503 and still deployed READY.

## What changes for users

- **Family privacy is enforced in the database, not the UI.** Joining a
  family needs the code and an approval; a member reads exactly one
  `profiles` row (their own) and the roster through `family_members()`'s
  enumerated columns; privileged columns (`subscription_tier`, `role`,
  `family_code`, Whop/Stripe ids) cannot be written from a browser.
- **Under-13 accounts are inert until an adult in the family consents**,
  enforced on 21 tables; only a parent account can consent.
- **Parents are read-only on player data** — attack-tested from the
  database (0 rows / 42501 on every write to the child's rows) and refused
  by every player-data API route (403). A parent's Settings is about the
  parent. Parents can write the season budget and notes; the budget is
  shared with every approved member (disclosed in `/privacy`).
- **No invented data.** Coach names/emails/recruits/ranks/URLs were removed
  in an earlier pass; tonight removed per-school cost and scholarship
  guesses, an "invited to ID camp" sample report, a methodology that
  described a roster model the code does not run, and a UTR of 7.0 that
  onboarding recorded for players who never entered one.
- **One fit story.** Every screen bands schools from one report
  (`lib/fit.ts`), projected to the summer before senior year (e.g. "By
  summer 2030" for the Class of 2031), labelled as an estimate with its
  growth assumption, and with the line "Top D1 programs often decide
  earlier, during junior year." Seniors past that summer use today's UTR.
  Reach vs Out of range is decided one way everywhere — the pace in the
  player's own logged ratings — so the same rating on the same date always
  gets the same band.
- **Real deletion and a complete export**, from Settings, reachable before
  onboarding.
- **Billing:** the Whop webhook path and a `?checkout=success` sync safety
  net; prices from one constant. The webhook endpoint itself still needs the
  dashboard steps in `docs/HANDOFF.md` §K.
- Accessibility and layout: skip link, accessible dialogs, ≥24px targets,
  no layout shift on load (measured), favicon/manifest, real 404s.

## Verification (measured, not asserted)

- `npx tsc --noEmit`, `npx next lint`, `npx vitest run` (**788 tests**),
  `next build` — green at the head of this PR.
- Overnight harness on a production build against staging
  (`scripts/README.md`): every route enumerated from `app/`, 9 personas;
  Chromium at 375 and 1440, light and dark (1,020 loads); every route ×
  persona at 320 and 375 recording anything clipped past the screen edge
  (510 loads); **WebKit 18.2 and Firefox 132** on the key routes for three
  personas, 375 and 1440, light and dark; legacy theme, OS dark mode, 200%
  zoom and reduced motion; Lighthouse on every public route. Results in
  `docs/FINAL_PASS_REPORT.md`.
- RLS attack suite re-run on staging after the night's changes: 18 + 14
  probes, all refused/allowed as designed; re-attacked independently by
  the verifier from persona (f).
- An independent verifier re-walked the personas and tried to defeat every
  guard: 4 HIGH, 7 MEDIUM, 4 LOW and nine guard bypasses, all HIGH fixed
  and re-measured, every bypass now caught (`docs/FINAL_PASS_REPORT.md`
  §WS8).
- Dry-run merge of `v1` into `origin/main` (`d059006`) in a throwaway
  worktree: clean, `middleware.ts` absent, migrations 022–039 present.

## Not in this PR (known, logged in `docs/TODO.md` week 1)

Parent dashboard upgrade; premium diagnostic onboarding; role-gating the
player tables' INSERT policies (a parent can still write rows under their
OWN id via PostgREST — never the child's) and `is_parent_member()`
role-aware; what `family_members()` returns to an under-13 whose consent is
pending; a parent's `/schools` still shifts on a phone (CLS 0.07–0.10);
deleting the plan generator and the Legacy design; checkout start must be
re-checked on the HTTPS preview (Whop rejects a localhost return URL).

## Rollback

Vercel → previous production deployment → Promote. Database changes do not
roll back with the code — see `docs/archive/GO-SEQUENCE.md` §5 and HANDOFF §J.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
