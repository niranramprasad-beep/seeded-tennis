# Seeded — QA Checklist & Testing Strategy

## Current state
- 382 Vitest unit tests across 28 files — all pass (verified 2026-11-10, 10s).
- `next lint` clean. `tsc --noEmit` fails only on stale `.next/types/app/friends` (deleted route) — clean `.next` before typechecking.
- Zero integration, RLS, API, E2E, accessibility, or visual tests. No CI.

## Strategy (minimum that actually protects launch)
| Layer | Tool | What |
|---|---|---|
| Unit | Vitest (exists) | fit classifier, projection, email builder, schemas |
| RLS | SQL scripts run against **staging** with `set role authenticated; set request.jwt.claims = …` | every table: stranger can't read/write; family member can read; parent can write budget only; privileged profile columns locked |
| API | Vitest + `fetch` against `next start` on staging | 401 without token, 400 on bad body, 200 on good body, no raw error text |
| E2E | Playwright (add) | the 20 journeys below, desktop 1440 + mobile 390 |
| Visual | Playwright screenshots vs mockups for the 5 main screens | catch 1–3px regressions the audit found |
| A11y | `@axe-core/playwright` | zero serious/critical |
| Data | SQL checks on import (DATA_QUALITY.md) | duplicates, ranges, freshness |

## Critical journeys (each must pass on staging before launch)
1. Landing page loads, header doesn't wrap, every CTA goes somewhere real
2. Signup (13+) → confirmation email → login
3. Login with wrong password shows a clear error; correct password lands on `/today`
4. Logout clears session; back button doesn't show private data
5. Password reset email → new password works
6. Onboarding: under-13 routed to parent signup (server-enforced)
7. Profile edit saves; privileged fields can't be changed (S-1 test)
8. Today shows the real UTR and no flash of wrong empty state
9. Schools search, filter, sort; "You {UTR}" equals the player's real UTR
10. Filters persist and the band chip counts equal the rows shown
11. School page: same band as on `/schools` and `/plan` for the same player
12. Roster range shows source + date or "Not tracked"
13. No coach name/email/recruit appears unless sourced
14. UTR entry: log, edit, outlier warning
15. Save school to targets and remove it
16. (AI) Copilot route returns 404 for V1
17. Family: parent joins only with approval; parent can't edit player data; parent can edit budget; player can't
18. Errors: kill network → friendly error + retry, no stack text
19. Mobile 390px: no clipped tables, tab bar works, no horizontal scroll
20. Unauthorized: stranger account can't read another user's rows via REST (script)

## RLS test skeleton (run on staging only)
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<stranger uuid>","role":"authenticated"}';
select count(*) from utr_entries where user_id = '<victim uuid>';   -- expect 0
update profiles set subscription_tier='family' where id = '<stranger uuid>'; -- expect 42501
select count(*) from families;                                        -- expect only own
rollback;
```

## Copy/claims review (P0-7) — every launch

Mostly automated now. `npx vitest run lib/copy-honesty.test.ts` scans every
shipped `.ts`/`.tsx` under `components/` and `app/` for the nine phrasings
removed in P0-7 and fails the build if one returns. Comments may still quote
the old copy — that's the record of why it went — so only live code is
checked.

**When a claim becomes true, delete its entry from that test in the same
commit that makes it true.** Never reword the copy to slip past the pattern;
that's how a claim comes back wearing a different hat.

The check can't judge copy nobody has written yet, so on every launch still
read the rendered pages and ask:
- [ ] Does every number on screen have a real source, or say it's an estimate / "Not tracked"?
- [ ] Is anything written in the present tense that is actually planned? ("Sunday email" and "public recruiting page" both arrived that way — intentions described as features.)
- [ ] Does any control write a value that nothing reads? A toggle wired to nothing is a claim too.
- [ ] Deletion copy matches what deletion actually does (today: sets a flag; a person actions it)
- [ ] Pricing features list matches what each tier unlocks in RLS
- [ ] Catalog counts quoted in prose match the real catalog (the honesty test guards the *fields*; counts in copy are still manual)
