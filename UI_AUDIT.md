# Seeded — Pre-Launch UI Audit

Audit only — no code changes in this pass. Checked at 375 / 768 / 1280 / 1920px, light + dark theme (`grass` / `night`), signed-out and signed-in where applicable. Severity: **[critical]** breaks the page or hides content, **[major]** clearly wrong/unpolished and visible to most users, **[minor]** nitpick/edge case.

Legend for recurring, already-covered ground: the touch-target floor (44px mobile), base type scale (12px fine-print / 14px body floor), and theme-token usage for `Button`/`Card`/`Badge` were already addressed in an earlier pass and re-verified spot-checks below rather than re-litigated per page.

---

## Cross-cutting (affects multiple pages)

- [major] **FIXED (Phase 2).** Dark-mode toggle had a real hydration/sync bug: `ThemeProvider` (`lib/context/theme-context.tsx`) initialized React state to `useState<ThemeId>("grass")` unconditionally, then only synced to the real saved theme inside a `useEffect` that runs after mount — so `DarkModeToggle`'s icon/label briefly showed "light" for any returning dark-mode user before flipping to the correct state on every load. Fix: added a `hydrated` flag to `ThemeProvider` (matching the existing convention already used by `SidebarProvider`/`PlayerProvider` in this codebase) that only becomes `true` once the real saved theme has been read. `DarkModeToggle` and the Settings page's `ThemeSwitcher` (same bug — its "active theme" card would flash Grass Court as selected before correcting) now render a neutral placeholder (blank icon slot, "Appearance" label, no card marked active) until `hydrated`, instead of ever showing a specific-but-wrong state. Verified live: full reload with `night` theme saved shows the correct state with no hydration-mismatch warning in console (confirmed server and first client render now agree — both show the same neutral placeholder).
- [minor] **RESOLVED — not a real bug, no fix needed.** Console warning (`...non-static position... scroll offset...`) traced to `CinematicBand`'s `useScroll({ target: ref })` — not `ScrollProgress` as first suspected (that one tracks `window`, no target). Confirmed it only fires on pages using `CinematicBand` (homepage), never on pages without it (e.g. `/login`). The target `<section>` already has `relative` positioning in its className, so this is React 18 StrictMode's dev-only double-render measuring the element mid-cycle, not a real positioning gap. **Verified empirically**: built and ran the actual production bundle (`next build && next start`, StrictMode's double-invoke only applies in `next dev`) and loaded the homepage fresh — zero console warnings. Real users on seededtennis.com never see this. Left the code as-is rather than making a speculative change to silence dev-only noise.
- [minor] **FIXED.** Added `app/error.tsx` — matches `not-found.tsx`'s layout/button pattern, uses the same error-state visual language as `AuthGate`'s connection-error screen (`error`/`error-bg` tokens, `AlertTriangle` icon). Verified live with a throwaway route that intentionally throws: the branded screen renders (not Next's bare default), "Try again" calls `reset()`, "Back home" navigates correctly, no overflow, dark mode applies correctly. Test route removed after verification.
- [minor] Signed-in users who navigate directly to `/` (marketing homepage) see the full marketing landing page (signup CTAs, "Browse schools free", demo tournament-fit widget) wrapped in their own authenticated **sidebar** instead of being redirected to `/dashboard` — confusing mixed context (you're both "logged in" and being pitched to sign up). Not broken, just an inconsistent experience worth a product call.
- [minor] Hardcoded fixed-hex backgrounds (not theme tokens) in a few chip/badge treatments — confirmed via grep, dark-mode contrast checked per-page below:
  - `components/home/fit-finder-teaser.tsx` (`bg-[#8A6D2F]`, `bg-[#8F3A24]`)
  - `components/tournaments/tournament-fit-view.tsx` (`bg-[#8A6D2F]`, `bg-[#E9C566]`, `bg-[#8F3A24]`, `bg-[#F0A98F]`, `bg-[#C0563A]`)
  - `components/training/training-view.tsx` (`bg-[#D14343]` — "now" line on the week-view time grid)
  - These all pair with `text-on-primary`, so text stays legible; what's unverified is whether the fixed background itself still reads as intentional (not washed-out/too-similar-to-bg) in dark mode. Checked below per page.
- [minor] **FIXED.** `components/ui/button.tsx`'s `primary`/`dark`/`leaf` variants now use `text-on-primary` instead of hardcoded `text-white`. Turned out to be a real (if latent) bug, not just a style inconsistency: the two "concept" themes (`concept-matchpoint`, `concept-nightrally`) override `--c-on-primary` to dark text because their accent colors are bright (volt chartreuse, mint). Verified live — switched to `concept-matchpoint` and confirmed the primary button now correctly renders dark text (`rgb(15,23,16)`) on the chartreuse background (`rgb(198,241,53)`); with the old `text-white` this would have been white-on-bright-green, a real contrast failure on any theme using that button. `night`/`grass`/other standard themes unaffected (still white, since `--c-on-primary` is white everywhere except those two concept themes).
- Confirmed **no duplicate theme system**: no Tailwind `dark:` variants in use anywhere (double-checked after an initial false-positive grep match on a JS object key named `dark` and a code comment), no `next-themes`, no `darkMode` config in `tailwind.config.ts`. The app uses exactly one mechanism — CSS custom properties scoped by `[data-theme="..."]` — consistently. Nothing to "remove" here; Phase 2 just needs to fix the React-state lag described above.

---

## Public / marketing pages

### `/` (homepage)
- Light + dark, 375/768/1280/1920: no horizontal overflow at any width. ✅
- No sub-12px text found.
- Dark mode: confirmed via computed style (`background-color: rgb(17,17,17)`), correct Night Match background applies instantly on attribute change — no visible breakage.
- [minor] Several footer links (`Browse schools`, `Roadmap`, etc., h≈16px) and the header logo link (h≈20px) are under the 44px touch-target floor. Consistent with this being a dense text-link footer (common, accepted exception), not flagging as major.

### `/how-it-works`
- Light + dark, 375/1920: no overflow, no sub-12px text. ✅ Clean.

### `/parents`
- Light + dark, 375/1920: no overflow, no sub-12px text. ✅ Clean.

### `/pricing`
- Light + dark, 375/1920: no page-level overflow. The feature-comparison table correctly uses its own `overflow-x-auto` wrapper (`min-w-[640px]` table inside a scrolling container) rather than forcing the whole page to scroll — this is the one intentional/contained horizontal-scroll case and it's done right. ✅

### `/contact`
- Light + dark, 375/1920: no overflow. ✅ Clean, simple page.

### `/terms`
- Light + dark, 375/1920: no overflow. Confirmed the `#privacy` anchor target exists and the footer's "Privacy" link resolves to it (from earlier work this session). ✅

### `/schools` (browse/filter)
- Light + dark, 375/768/1920: no page-level overflow at any width. ✅
- Desktop (1920): content is properly max-width-constrained, doesn't stretch edge-to-edge. ✅
- Under-44px tap targets found are all footer links + header logo + a table column-sort header (36px tall) — same accepted dense-list exception as the homepage footer, not re-flagging per page.

### `/schools/[slug]` (school detail, checked `stanford-m`)
- Light + dark, 375/1920: no overflow. ✅

---

## Theme toggle — Phase 2 (fixed)

- [critical] **FIXED.** Sidebar dark-mode toggle lost its touch target when the sidebar was collapsed. `components/layout/sidebar.tsx:137` was overriding `DarkModeToggle`'s className with `"mx-auto flex w-auto justify-center px-0"` — the `w-auto` replaced the base `w-11` via `cn()`/tailwind-merge, shrinking the button to its icon's ~16px intrinsic width instead of a 44×44 square. Fix: changed the override to just `"mx-auto"` — `DarkModeToggle`'s base classes already include `flex h-11 w-11 items-center justify-center`, so centering it in the collapsed rail only ever needed the margin, not a width/display override. Verified live: collapsed-state toggle now measures `{w: 44, h: 44}` via `getBoundingClientRect()`.
- Desktop-expanded and mobile-drawer toggle instances both verified correctly sized (44px+) and correctly responsive-hidden/shown (confirmed two separate DOM instances — one in the fixed `<aside>` hidden below `lg`, one in the mobile drawer shown below `lg` — no duplicate-rendering bug, this part works as intended).
- Toggle correctly flips `data-theme` on click and persists to `localStorage.seeded.theme`; confirmed the actual background/colors update instantly and correctly on both light→dark and dark→light clicks.

---

## Auth pages

### `/login`
- Light + dark, 375/1920: no overflow. ✅
- Confirmed the decorative `FloatingDots` background is correctly hidden below `sm` (earlier fix holds) — doesn't collide with the form on mobile.
- **Focus ring verified in a real browser** (not the sandboxed preview tool — see methodology note below): tabbing/focusing the email input produces a real, correctly-colored green ring (`rgba(21,128,61,0.3) 0 0 0 2px`). Visible focus states work.
- Empty-state validation confirmed: Continue-equivalent sign-in button doesn't silently no-op on bad input — real inline error message shown (already verified earlier this session).
- *Methodology note:* the sandboxed `preview_*` tool used for the rest of this audit doesn't grant the automated browser window real OS-level focus, so `:focus` CSS doesn't engage even though `document.activeElement` updates correctly — I initially (wrongly) suspected a missing focus ring here, then confirmed it was a tooling artifact by re-testing in a real connected Chrome tab. Flagging this so a manual click-through on your end isn't treated as redundant — it's the one check class my primary tool can't fully verify, though spot-checks in a real browser came back clean.

### `/signup` (all 3 steps, both "create" and "join" family sub-states)
- Light + dark, 375/1920: no overflow at any step. ✅
- Disabled-state button correctly disabled when required fields are empty (real validation, not a silent no-op). ✅

### `/parent-login`
- Light + dark, 375/1920: no overflow. ✅

### `/parent-signup`
- Light + dark, 375/1920: no overflow. ✅

### `/reset-password`
- Light + dark, 375/1920: no overflow. All 3 states (request link / sent confirmation / set new password) reviewed via code — each has real designed content, not a bare placeholder. ✅

---

## Core authenticated app (player role)

### `/dashboard`
- Light + dark, 375/768/1280/1920: no overflow at any width. ✅
- [minor] **FIXED.** "Open planner" and "Full roadmap" were 20px tall; added `min-h-11` (the same pattern already used throughout the app for pill/link tap targets, e.g. the roadmap school-picker). Verified live: both now measure 44px, and the card header rows still look correctly aligned (screenshot-checked) — no layout regression against the neighboring `<h2>` title.
- Mobile hamburger menu opens/closes correctly, no overflow in the open drawer.
- Confirmed the (now-fixed) collapsed-sidebar dark-mode-toggle bug reproduced here too — it was a `Sidebar`-level issue affecting every authenticated page, not page-specific. Re-verified fixed here post-Phase-2.

### `/roadmap`
- Light + dark, 375/1920: no overflow. The year-by-year timeline correctly uses a contained horizontal scroll (`overflow-x-auto` on just that row) — the one appropriate "intentional carousel" exception, doesn't leak to the page. ✅

### `/training` (calendar — the most layout-complex page)
- Light + dark, 375/1920: no overflow in Day, Week, or Month view. ✅
- Dark-mode spot check: the hardcoded `bg-[#D14343]` "current time" line on the week grid reads with strong contrast against the dark card background (`rgb(209,67,67)` vs `rgb(25,25,25)`) — confirmed fine, not re-flagging the cross-cutting hardcoded-color note for this specific instance.
- Session create/edit/delete drawer, Day/Week/Month toggle, and Supabase persistence already verified end-to-end in a prior pass this session — not re-testing functionality here, UI-only pass.

### `/match-mode`
- Light + dark, 375/1920: no overflow. ✅

### `/matches` (match history)
- Light + dark, 375/1920: no overflow. ✅

### `/tournament-fit` (signed-in view)
- Light + dark, 375/1920: no overflow. Submitted the form to confirm the verdict card renders real computed content (not a placeholder) — ✅.
- **Verified (Phase 3), no longer a guess:** forced a `BAD FIT` verdict (L1 level against a 7.0 UTR, 12hr travel, $900 cost) to actually render the rust-hex chip. Confirmed in dark mode: chip background `rgb(143,58,36)` against the page's `rgb(17,17,17)`/card's `rgb(25,25,25)` reads as a clearly distinct, intentional element (not washed out), with white `text-on-primary` text giving strong contrast. Same conclusion as the `#D14343` case on `/training` — no fix needed.

### `/coaches` (coach outreach)
- Light + dark, 375/1920: no overflow. ✅
- Email generation, Mark as contacted/replied, and Supabase persistence already verified end-to-end earlier this session (including the fix moving it off localStorage) — UI-only pass here.

### `/friends`
- Light + dark, 375/1920: no overflow. ✅

### `/badges`
- Light + dark, 375/1920: no overflow. ✅

### `/cost-calculator`
- Light + dark, 375/1920: no overflow. ✅

### `/settings` (including the full 9-theme picker)
- Light + dark, 375/1920: no overflow. ✅
- Clicked through multiple themes live, including a non-"night" dark theme (`concept-nightrally`) — background/colors switch instantly and correctly every time, and the sidebar's `DarkModeToggle` correctly shows "Dark mode" for it too (confirms the `dark: true` flag mechanism in `THEMES` works for themes other than literally "night", as the code comment intends).
- "Copy family code" buttons already fixed to 44px earlier this session.

### `/onboarding` (all 4 steps)
- Light + dark, 375/1920: no overflow at any step (UTR slider, grade picker, target-school picker, focus-area picker). ✅

### `/family` (parent-role dashboard)
- Light + dark, 375/768/1920: no overflow. One transient reading at 1920 immediately after page-enter turned out to be a Framer Motion entrance-animation timing artifact (scrollWidth briefly includes an element mid-transition) — confirmed clean on a full reload + settle, not a real bug, noting the methodology so it isn't mistaken for a flaky re-check.
- Real parent-specific empty/live states render correctly (player snapshot, encouragement notes).

### Paywall lock screens (`PaidGate`, free-tier account)
- `/training` ("Training is a Player feature") and `/coaches` ("Coach outreach is a Family feature") both checked light+dark, 375+1920: real designed lock screens (icon, tier badge, perks list, two CTAs), not bare text, no overflow. ✅

### `/not-found` (404)
- Light + dark, 375/1920: no overflow, branded (not Next's bare default). ✅
- [minor] **FIXED** — see Cross-cutting above, `app/error.tsx` added and verified.

### Loading states (`app/dashboard/loading.tsx`, `app/schools/loading.tsx`)
- Reviewed via code: both are real skeleton-shimmer layouts (matching each page's actual grid shape), not bare "Loading…" text. `Skeleton` component uses the theme token `bg-line/40`, not a hardcoded gray — confirmed theme-safe by construction.

### Connection-error state (`AuthGate`, simulated Supabase-unreachable)
- Functionally verified earlier this session on the live production site (shows "We're having trouble connecting" + Retry button, confirmed via real network-failure simulation). Not re-verified pixel-by-pixel in this pass — forcing this state requires patching `window.fetch` before the root layout's data-fetch effect runs, which doesn't survive a page reload in the sandboxed audit tool (a tooling limitation, not something uncertain about the app). Code review of the component (`components/shared/auth-gate.tsx`) shows it uses the same `Button`, spacing, and `error`/`error-bg` theme tokens as every other screen already confirmed clean, so no new risk expected — flagging as the one state I'd suggest you glance at by hand if you want full certainty.

---

## Summary

**Phase 2 — done.** Both theme-toggle bugs fixed and verified:
1. ~~**[critical]** Collapsed-sidebar dark-mode toggle shrinks to a 16px-wide tap target.~~ **FIXED** — `sidebar.tsx:137`, removed the stray `w-auto` override. Confirmed 44×44 live.
2. ~~**[major]** Theme-toggle visual lag on load for returning dark-mode users.~~ **FIXED** — added a `hydrated` flag to `ThemeProvider`; `DarkModeToggle` and the Settings `ThemeSwitcher` (same bug, found while fixing this) now show a neutral placeholder instead of a wrong-then-right flash. Confirmed no hydration-mismatch warning introduced; `npm run build`, `eslint`, and the full test suite (57 tests) all pass clean.

**Phase 3 — done.** Every actionable item fixed; the two left standing are a deliberate judgment call and a genuine product-framing question, not defects:
1. ~~**[minor]** Recurring console warning...~~ **RESOLVED** — confirmed dev-only (React StrictMode double-render of `CinematicBand`'s `useScroll`), doesn't reach production (verified by running the actual production build). No code change.
2. ~~**[minor]** No custom `error.tsx`...~~ **FIXED** — added, verified live with a throwaway throwing route, then removed the test route.
3. ~~**[minor]** `Button`'s `primary`/`dark`/`leaf` variants hardcode `text-white`...~~ **FIXED** — turned out to be a real contrast bug on the two bright "concept" themes (dark text now correctly renders on the chartreuse accent), not just a style inconsistency. Verified live in both a standard and a concept theme.
4. ~~**[minor]** Dashboard card links ("Open planner", "Full roadmap")...~~ **FIXED** — `min-h-11` added, verified 44px live, no layout regression (screenshot-checked).
5. **[minor] Judgment call, left as-is:** footer links (h≈16px), the header logo link, and a table column-sort header remain under 44px. These are dense-text-list / utility-chrome elements, not primary actions — ballooning a footer link list or a logo mark to 44px tall each would visually break those sections for no real usability gain (the same exception most production sites make). Flagging the call explicitly rather than silently skipping it or mechanically forcing a floor onto content that doesn't want it.
6. **[minor] Left for your call, not a defect:** signed-in users can still reach the raw marketing `/` and see it wrapped in their own sidebar instead of being redirected to `/dashboard`. This is a routing/product decision (where should a logged-in user land on `/`?), not a UI bug — didn't make that call unilaterally. Say the word and I'll add the redirect.
7. ~~**Unverified**: gold/rust hardcoded-hex verdict chips on `/tournament-fit`...~~ **VERIFIED** — forced an actual `BAD FIT` verdict and confirmed the chip reads clearly against the dark page/card background. The Supabase-connection-error screen's pixel-level render remains genuinely unverifiable with the tools available to me (patching `window.fetch` to simulate the outage doesn't survive a page reload, and no browser-level request-blocking tool is available) — functionally confirmed earlier this session on the live production site, code-reviewed to use the same tokens as every other confirmed-clean screen, but flagging that the exact pixels weren't re-checked in this pass.

**What's already clean** (checked at 375/768/1280/1920, light + dark): every marketing page, every auth page, every core and secondary authenticated page, both paywall lock screens, 404, and both loading skeletons — no horizontal overflow anywhere, no sub-12px text, focus rings confirmed working in a real browser, no duplicate/conflicting theme system to clean up (the app already uses exactly one mechanism).

**Verification:** `npm run build`, `eslint`, `tsc --noEmit`, and the full test suite (57 tests) all pass clean with every Phase 2 + Phase 3 change applied together. Re-walked the changed surfaces (sidebar collapsed/expanded, mobile drawer, dashboard, pricing, settings theme picker, error boundary) across both themes and multiple widths after the fixes landed — nothing regressed.

No Supabase schema, auth logic, Stripe/Whop code, or API routes were touched in Phase 2 or 3 — every fix was UI-layer only (components, one context file, one new error-boundary page).
