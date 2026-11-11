# Seeded — Decisions Log

Format: date · decision · why · status. Older decisions are in
`docs/HANDOFF.md` §F and still stand unless overridden here.

- **2026-11-10 · V1 scope cut to the recruiting core.** Training calendar, copilot, notifications, weekly emails, public recruiting page, transfer portal and probability features are POST-V1. Why: each is either unbacked by real data or adds attack surface before the core is honest. Status: proposed — needs owner sign-off.
- **2026-11-10 · Legacy design system will be removed, not maintained.** Why: it doubles every screen and keeps the copilot, `/coaches` and `/training` alive. Status: proposed.
- **2026-11-10 · Privileged profile columns are server-only.** `subscription_tier`, `role`, `family_code`, `whop_membership_id`, `stripe_*` change only via service role or dedicated RPCs. Migration 022 drafted. Status: proposed — needs sign-off.
- **2026-11-10 · Coach contact info is never stored or generated.** Link the school's staff directory; the player types the recipient. Why: invented emails reached the UI and drafts. Status: proposed.
- **2026-11-10 · Fit bands must come from one function with one projection input.** No screen may call `classifySchoolFit` without a projection that can produce "out-of-range". Status: proposed.
- **2026-11-10 · Staging Supabase before any further migration.** Status: proposed.
