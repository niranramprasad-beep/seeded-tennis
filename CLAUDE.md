# Seeded — notes for Claude

## Read before coding (in this order)
1. `docs/MASTER_ROADMAP.md` — status, blockers, and the NEXT 10 TASKS. Work from it.
2. `docs/SECURITY_CHECKLIST.md` — before touching auth, RLS, profiles, family, billing, or any API route.
3. `docs/DATA_QUALITY.md` — before touching schools, rosters, UTR, or fit math.
4. `docs/TECHNICAL_ARCHITECTURE.md`, `docs/DATABASE_SPEC.md` — how it's built.
5. `docs/QA_CHECKLIST.md`, `docs/DEPLOYMENT_CHECKLIST.md` — before shipping.
6. `docs/HANDOFF.md` — long-form history and route table (see its correction banner).

## Current blockers (keep in sync with MASTER_ROADMAP)
- P0-1/P0-2: users can self-assign `subscription_tier`, `role`, `family_code` and join any family. Fix drafted in `supabase/migrations/022_…sql` (not applied).
- P0-3: DONE — invented coach names/emails/recruits/ranks/URLs are deleted from the `School` type and all 68 catalog entries; `lib/db/schools-catalog-honesty.test.ts` fails the build on any re-add. Roster UTR numbers are still unsourced estimates, now labeled via `UTR_RANGE_SOURCE_LABEL`. Real fix = P1-DATA-1.
- P0-4: DONE — every sentence in the coach email traces to a value the player entered, or to the school's name/division/conference. UTR is labeled "(self-reported)". Keep it that way: saying more about a program needs sourced data (P1-DATA-1), not better phrasing.
- P0-5/P0-6: prod (`main`) is broken against the shared DB; there is no staging project.
- P0-7: DONE — removed "Rosters verified Oct 2026", "every team rating shows its source and date", the Sunday-email promise, the Notifications card + tab, the Public-recruiting-page toggle, "Removes everything within 30 days", "all D1 programs", and both "within 48 hours" promises. `lib/copy-honesty.test.ts` fails the build if any phrasing returns. **When a claim becomes true, delete its entry from that test in the same commit — don't reword around it.**
- P0-8: open, needs legal/adult review. Deletion still doesn't delete; the UI now says so.
- P1-FIT-1/P1-FIT-2: DONE — `whatIfProjectionFor()` always returns a projection (synthetic straight line for the hypothetical modes), and the untouched what-if panel passes the *real* projection, so every screen agrees by construction. `useWhatIfUtr` stores only the player's explicit choice; everything else derives from props, so it can't capture the placeholder `currentUTR: 7` again. Guarded by `lib/fit-band-consistency.test.ts`.
  **Never pass `undefined` as the projection to `classifySchoolFit`** — it isn't neutral, it returns "reach" for every school below the team floor. `syntheticUtrHistoryFor()` exists for cases with no real history.
- P1-SEC-1/P1-SEC-5: DONE — the Gemini copilot and Stripe routes are deleted. V1 ships no AI feature. **The Gemini and Stripe keys still need revoking at the provider.**

## Always
- Update `docs/MASTER_ROADMAP.md` in the same commit as the work: status, new findings, NEXT 10.
- Before modifying auth/authorization, read the live policies (`pg_policies`) and the 022 trigger. Never replace RLS with a client-side check — `AuthGate`/`PaidGate` are cosmetic.
- Run `rm -rf .next && npx tsc --noEmit && npx next lint && npx vitest run` before saying something works.
- Use one fit-band path: `classifySchoolFit` must always get a projection that can return "out-of-range".
- Show "Not tracked" for missing data. Show the source and date next to any roster number.
- Keep secrets out of code, docs, logs, screenshots, and commits. Names only.

## Never
- Never invent coach names, emails, recruits, rankings, or UTRs — not even as "placeholder" data in shipped code.
- Never write privileged `profiles` columns from the client (`subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*`).
- Never add a feature that promises email/notifications/public pages unless the sending/serving code exists.
- Never build POST-V1 features while any P0/P1 is open.
- Never apply a migration to the shared project before staging exists — and never without explicit sign-off.

## Non-negotiable rules

- **No generated or made-up data, anywhere.** Missing real data → an
  honest empty/"Not tracked" state, never a plausible-looking invention.
- **No fabricated coach emails or outreach content.** Drafts build from
  the player's own real logged results. (Coach name/email fields
  themselves are still unverified seed data — see HANDOFF TODO #1.)
- **4-band fit model**: Likely / Target / Reach / Out of range, per
  `/methodology`, in `lib/school-fit.ts`. Reach-vs-Out-of-range uses a
  real UTR-trajectory projection, never a static snapshot.
- **"Leaving" counts, never "open spots."** Real grad-year math only.
- **5-item nav**: Today, Plan, Schools, Outreach, Events. Settings/Family
  live under the avatar menu.
- **Friends and badges are removed, product-wide.** Don't resurrect
  either without being explicitly asked.
- **No auto-generated training plans — manual calendar only.** (Currently
  violated by the training setup wizard — see HANDOFF TODO #2, not fixed
  yet, don't treat the existing wizard as the intended design.)
- **Gmail = compose-link only.** Never the Gmail API, never inbox access,
  never auto-send.
- **UTR = profile link + manual check-in only.** Never fetch or scrape
  UTR data from anywhere.
- **Parents are read-only except the season budget.** Enforced in the UI
  and at the RLS layer.
- **Under-13 → a parent creates the account**, checked at onboarding.
- **The mockups are the source of truth for UI.** Match them exactly;
  flag anything that looks wrong instead of silently "improving" it.
- **Never apply a migration, change pricing/Whop config, or push to
  `main` without explicit, current-turn sign-off.** `main` auto-deploys
  straight to production with no staging gate.
- **Local dev shares production's real Supabase project.** Never sign in
  through real auth locally without a clearly-fake, disposable account —
  and delete it (and everything it touched) immediately after testing.

## Commands

```
npm run dev              # local dev server, localhost:3000
npx vitest run            # full test suite
npx tsc --noEmit           # typecheck
npx next build              # production build (rm -rf .next first if you
                             # hit a stale-cache module error — known
                             # flaky issue, not a real bug)
npx next lint                # lint
```

Migrations and Supabase type generation are done via the Supabase MCP's
`apply_migration` / `generate_typescript_types` tools against the live
project — there's no local Supabase CLI step in this project's workflow.
Never apply a migration without explicit sign-off; write the `.sql` file
and wait to be told to run it.
