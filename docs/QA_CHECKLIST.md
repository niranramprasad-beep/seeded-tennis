# Seeded — QA Checklist & Testing Strategy

## Current state (2026-11-21)
- **Vitest:** 121 test files, 1,816 tests (fresh run on `main` @ `1510868`). Many are build-failing guards for
  product rules (copy honesty, no invented school data, no invented goal,
  UTR sentinel, fit-band consistency, family scope, Family-plan lock,
  budget parent-only, no auto-generated training). CLAUDE.md names each one
  next to its rule.
- **CI:** `.github/workflows/ci.yml`, job `verify` — typecheck, lint, tests,
  build, plus the suite again in two time zones (`npm run test:tz`:
  America/New_York and Pacific/Auckland) — on pull requests to and pushes
  to `main`. `main` requires a green `verify` to merge.
- **Locally, before saying something works:**
  `rm -rf .next && npx tsc --noEmit && npm run lint && npx vitest run`
  (a stale `.next` can fail the typecheck on deleted routes).
- **Not automated:** RLS, API-against-a-server, E2E, visual and a11y tests
  are not in CI. RLS is probed by hand as real users on staging (below);
  `scripts/` holds ad-hoc Playwright / Lighthouse / axe runs
  (`scripts/README.md`).

## Strategy
| Layer | Tool | What |
|---|---|---|
| Unit + guards | Vitest (in CI) | fit classifier, projection, coach email, schemas, honesty guards |
| RLS | SQL on **staging** as a real user, in a rolled-back transaction | stranger reads nothing; family reads only with the Family plan; only parents write budget/notes; privileged profile columns locked |
| API | Vitest: request-body schemas (`lib/api-schemas/*.test.ts`) today; no tests against a running server yet | 401 without token, 400 on bad body, 429 when limited, no raw error text |
| E2E / visual / a11y | `scripts/` (Playwright, axe), not in CI | journeys below, desktop 1440 + mobile 390 |
| Data | Import checks (DATA_QUALITY.md) | duplicates, ranges, freshness |

## Critical journeys (on a Preview deployment, which reads staging)
1. Landing page loads, header doesn't wrap, every CTA goes somewhere real
2. Signup (13+) → login
3. Wrong password shows a clear error; correct password lands on `/today`
4. Logout clears session; back button doesn't show private data
5. Password reset → new password works
6. Onboarding: under-13 routed to a parent; the account stays inert until an adult in the family consents (030)
7. Profile edit saves; privileged fields can't be changed (42501)
8. Today shows the real UTR, or "Not tracked" when none is logged — never 0 or 7
9. Schools search, filter, sort; "You {UTR}" equals the player's real UTR
10. Filters persist and the band chip counts equal the rows shown
11. School page: same band as on `/schools` and `/plan` for the same player
12. Roster range shows "Unverified estimate" or "Not tracked"
13. No coach name/email/recruit appears anywhere
14. UTR entry: log, edit, delete
15. Save a school to targets and remove it; Free stops at 3
16. Coach email: Copy/Gmail disabled while any `[` or `]` placeholder remains
17. Family: a joiner lands pending; approval works; a parent must verify their email before joining/approving; without the Family plan members see the roster but not each other's data; only parents can edit the budget; a player can't
18. Leave family works; the account holder can't leave
19. Errors: kill network → friendly error + retry, no stack text
20. Mobile 390px: no clipped tables, five-item bottom bar, no horizontal scroll
21. Stranger account can't read another user's rows via REST (script below)

## RLS probe skeleton (staging only)
```sql
begin;
set local role authenticated;  -- mandatory: postgres bypasses RLS
select set_config('request.jwt.claims',
  '{"sub":"<stranger uuid>","role":"authenticated"}', true);
select count(*) from utr_entries where user_id = '<victim uuid>';        -- expect 0
update profiles set subscription_tier = 'family' where id = '<stranger uuid>'; -- expect 42501
select count(*) from profiles;                                             -- expect 1 (own row)
rollback;
```
Fake accounts and families to use: `docs/STAGING_PERSONAS.md`.

## Copy/claims review — every launch

Mostly automated: `lib/copy-honesty.test.ts` scans shipped `.ts`/`.tsx` under
`components/` and `app/` for phrasings removed in P0-7 and fails the build if
one returns. **When a claim becomes true, delete its entry from that test in
the same commit** — never reword around it.

The test can't judge copy nobody has written yet, so still read the rendered
pages and ask:
- [ ] Does every number have a real source, or say it's an estimate / "Not tracked"?
- [ ] Is anything in the present tense actually only planned? (The old "Sunday email" and "public recruiting page" arrived that way.)
- [ ] Does any control write a value nothing reads?
- [ ] Does anything imply Seeded sends email or notifications? It sends none ("Remind them" only re-sorts a request).
- [ ] Deletion copy matches what `delete_my_account()` does (deletes the caller's data)
- [ ] Pricing features match what each tier unlocks in RLS (Player: outreach + training writes, unlimited targets; Family: family sharing, budget, notes)
- [ ] Catalog counts quoted in prose match the real catalog
