# Seeded — final pre-launch pass

Live log. Updated after every workstream so this is resumable: on resume,
read this plus `git log --oneline` and continue from the first unfinished
item. Never redo finished work.

**Branch:** `v1`. **Started from:** `30780d5`.
**Baseline before this pass:** 670 tests in 52 files; production build, both
modes: 0 axe violations, 0 console errors, header 1 row / 73px on 9 pages,
Lighthouse a11y 100 / SEO 100.

| Workstream | Status |
|---|---|
| A — fit report tells one true story | **DONE** (`00b972e`) |
| B — real-user walkthroughs (7 personas) | IN PROGRESS |
| C — premium design detail pass | not started |
| D — truth & honesty sweep | not started |
| E — regression safety | not started |
| F — final independent verification | not started |

---

## A — the fit report must tell one true story

### A0. Reproducing the reported bug first

**Reproduced, exactly as reported.** `/onboarding` with Men's · UTR 8.7 ·
Class of 2031 computed its numbers three different ways from two parallel
band systems:

| surface | source | number |
|---|---|---|
| trajectory panel | `countBands` (lib/fit.ts) at the projected UTR | 0 today → 20 |
| headline + tabs | `countSchoolFits` (lib/school-fit.ts) at today's UTR | Reach 37 · Target 0 · Likely 0 |
| every row | `classifySchoolFit` at today's UTR | 8.7 vs the team range |

Each was correct about a different question. Nothing on the screen said they
were different questions.

### A1–A2. One rating, one report

- `recruitingTimeUtr()` is the only place that decides WHICH rating judges
  fit: projected to junior year before then, today's rating for juniors and
  seniors, `null` with no rating.
- `buildFitReport()` is the only place that turns a rating into bands. It
  returns counts, per-school rows, both views' totals and `bandBySlug`.
- `useFitReport()` is how every signed-in screen gets it, sharing the
  `utr-entries` SWR key so it costs nothing extra.

**Enforced by the type system, not a lint.** `classifySchoolFit` now takes a
branded `FitBasis` whose brand is a `unique symbol` private to
`school-fit.ts`. `classifySchoolFit(8.7, school)` does not compile. Making
the change surfaced **50 compile errors across 13 files** — every one a
place that had been choosing its own rating.

Migrated: onboarding fit report, homepage widget, /schools browser +
compare drawer, /today dashboard, parent family overview, outreach board,
school sort, today-actions.

### A3–A7

Segmented "By junior year | Today" toggle, shown only when the views
actually differ. Headline, secondary line, tab counts, row bands and the
trajectory line all read the same report. Per-row "Today: Reach → Junior
year: Target" when they differ, with a muted hollow marker for today's
rating on the range bar and a tooltip line naming it. "Estimate" chip and
the assumption sentence wherever a projection appears. Openings/Academics
columns removed — they were hardcoded "Not tracked" on every row. The save
card now asks for a first name and last initial, same nudge as /signup.

### Bugs this found that the brief did not list

1. **"in range" meant two different things.** The trajectory panel counted
   target+likely; I had defined it as reach+target+likely. A Reach is by
   definition a program you are not competitive for, so it is now
   target+likely everywhere, defined once.
2. **The Today view still said "By junior year…".** The headline keyed off
   whether a projection existed rather than the selected view — the same
   conflation, reintroduced by the toggle meant to fix it. Found by walking
   the persona, not by a test.
3. **Juniors' headline dropped Likely.** "realistic target for 10 programs"
   while the tabs said 10 Target + 2 Likely.
4. **Reach jumped 2 → 31 between views for persona (b).** The recruiting
   basis passed no projection, so every below-floor school fell through to
   Reach and the view lost the ability to tell Reach from Out-of-range.
   Fixed with a residual slow-pace curve to senior summer; persona (a) now
   reads 37 reaches today → 7 reaches, 12 targets, 8 likelies at junior
   year instead of "all my reaches vanished".
5. **Persona (e) hit a dead end** — a 4.0 beginner saw three tabs reading 0
   and no next step. Now an honest empty state naming the catalogue's limit
   and pointing at the tournament checker.

### A8 guards, all mutation-tested

`lib/fit-single-source.test.ts` — (a) for all five UTR personas in BOTH
views: headline == tab counts == rows rendered == trajectory total; (b) no
component may classify, count or mint a basis; (c) no rating → no bands.
Four mutations fail the build: recomputing the panel separately, banding
rows from one view while counting the other, a component classifying for
itself, and judging a pre-junior player on today's rating.

**Walkthrough result: all five UTR personas consistent in every view.**

| persona | junior-year view | today view |
|---|---|---|
| a Men's 8.7 C/2031 | R7 T12 L8 | R37 T0 L0 |
| b Women's 6.0 C/2029 | R0 T0 L0 | R2 T0 L0 |
| c Men's 11.0 C/2027 | — (junior: one view) | R0 T10 L2 |
| d Women's 9.4 C/2026 | — (senior: one view) | R0 T8 L2 |
| e Men's 4.0 C/2030 | R0 T0 L0 + empty state | same |

Tests 670 → 688. Typecheck, lint, build green.

---

## B — real-user walkthroughs

`scripts/persona-walk.mjs` drives each persona through the public journey on
a **production build** at 1440 and 375, light and dark — 8 screens × 4
combinations = 32 captures each, 160 in
`~/seeded-evidence/final-pass/`. It does not just screenshot: it reads the
numbers each screen claims and fails on contradictions, because a screenshot
cannot tell you the headline said 20 and the tabs said 12.

**Result: 80 problems → 0.**

### Two harness bugs found first, which is the point of checking the checker

1. **A 400 on every page.** `/onboarding`'s chunk 400'd everywhere. It was
   mine: I had rebuilt `.next` without restarting `next start`, so the
   running server served HTML referencing chunk hashes the rebuild had
   replaced. The same class of mistake as the blank-screenshot one — a
   harness reporting a fault it created.
2. **169 "tap targets under 44px" on /schools.** Almost all were links
   inside a sentence, which WCAG exempts because you cannot give a word in
   a paragraph a 44px box. Also counted `sr-only` inputs (1px by design)
   and 20px checkboxes sitting inside 44px labels.

### Real mobile findings, all fixed

| what | was | now |
|---|---|---|
| Header logo, every page | 28px | 44px |
| `/schools` compare checkbox | 13px | 20px box in a 44px label |
| `/schools` star + expand buttons | 28px | 44px (negative margin keeps row height) |
| `/schools` band chips, sort + filter selects | 32–34px | 44px on mobile |
| `/pricing` billing toggle | 40px | 44px |
| Footer link columns (6 public routes) | 20px | 44px on mobile |
| FAQ disclosure buttons | 26px | 44px |
| Tournament level buttons, sidebar nav | 40px | 44px |
| School page breadcrumb / "Report an error" / staff link | 20–26px | 44px |
| Range-bar track (carries the tooltip) | 10px | 50px via `::after`, layout untouched |

The star button needed the fix at the **call site**: the component asked for
`h-11 w-11` and the caller's `className="h-7 w-7"` won, because `cn()` is
tailwind-merge and the later class wins. Worth remembering — a component
cannot enforce its own minimum size against a caller.

The harness now measures a pseudo-element hit area rather than exempting
it, so the range bar is checked rather than excused.

**Still to walk: personas (f) parent-of-(a) and (g) under-13.** Both need a
session; see below.

