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
| A — fit report tells one true story | IN PROGRESS |
| B — real-user walkthroughs (7 personas) | not started |
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

