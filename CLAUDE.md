# Seeded — notes for Claude

**Read `docs/HANDOFF.md` before starting any task.** It's the current,
verified source of truth for architecture, routes, database, and
open TODOs — this file is just the short non-negotiable rules + commands.

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
