# Catalog expansion plan

Written 2026-11-18. **A plan only: nothing in this file changes data.** The
rules it works inside are CLAUDE.md's: no invented ranges, no UTR scraping or
lookups by the app, and every team number shows where it came from and when.

## The problem, measured

A men's player at UTR 5.95 (the Nov 18 production sweep) sees **Reach 0 /
Target 0 / Likely 0** across all 37 men's programs, and every "closest
school" is Out of range. That is the catalog, not the fit math:

| | D1 | D2 | D3 | NAIA | JUCO | total |
|---|---|---|---|---|---|---|
| Men | 30 | 3 | 4 | 0 | 0 | 37 |
| Women | 24 | 3 | 4 | 0 | 0 | 31 |

Team floors in the catalog today (the "competitive floor" estimate):

- **Men:** lowest 9.3, median about 11.4, highest 13.1. Nothing below 9.3.
- **Women:** lowest 8.1, median about 10.0, highest 10.9. Nothing below 8.1.

A typical junior the product is for sits at UTR 5–9. For a men's 5–9 player
the catalog has nothing in Target or Likely at all; for women, only players
above ~8 see anything. The catalog is almost entirely upper-D1.

## Which levels to add

Ordered by how many 5–9 juniors each one serves. The UTR bands below are
**rough planning assumptions to size the work, not data** — none of them may
appear in the product. Each real range ships only with its own source and
date.

| Level | Approx. programs (men / women)* | Where a 5–9 player usually fits | Priority |
|---|---|---|---|
| D3 | ~320 / ~370 | Men ~6–10, women ~4–8: the biggest pool for this player | 1 |
| NAIA | ~90 / ~100 | Men ~6–10, women ~5–8 | 2 |
| D2 | ~160 / ~210 | Men ~8–11, women ~6–9 | 2 |
| Lower D1 (mid-major conferences) | ~120 / ~150 not yet listed | Men ~9–11, women ~7–9 | 3 |
| JUCO (NJCAA) | ~50 / ~60 | Men ~5–9, women ~3–7 | 3 |
| More women's at every level | — | Women's pool is larger than men's at every division | throughout |

\* Program counts are approximate public totals, to be confirmed from each
association's own member directory before the work is scoped for real.

## Where the data comes from, and how it is verified

Two separate things are needed per program, and they have different sources.

**1. That the program exists** (name, division, conference, state, gender):
the NCAA, NAIA and NJCAA public member directories, entered by a person, with
the directory and the date recorded. Low risk; this is reference data.

**2. The team's UTR range** (floor, middle, top). This is the hard part, and
the reason the catalog is small. The app may not fetch or scrape UTR data,
and nothing may be guessed. Options, best first:

| Source | How | Verified by | Notes |
|---|---|---|---|
| **A licensed data feed** (UTR Sports or similar) | A signed data agreement; ranges arrive with their own date | The licence and the feed's timestamp | The only option that scales to ~1,000 programs. Needs Niran to approach them. |
| **Coach-submitted ranges** | A short form a coach fills for their own program, from a verified athletics email domain | The domain + a second check | Slow to build up, but the best quality and a reason for coaches to know Seeded. |
| **Hand-curated from public rosters** | A person reads the public roster on the athletics site and the players' public ratings, computes floor / middle / top by a written rule, and records the URL and date | A second person re-checks a sample (say 1 in 5) | The interim option. It is labour, not code. It must be a person, never the app. |

Whatever the source, every range is stored with `source_type`, `source_url`
(or "coach-submitted"), `as_of` date and `verified_by`, and the UI shows the
source and date next to the number, as CLAUDE.md requires. A range older than
about 12 months shows as stale.

## Schema changes needed

Today the catalog is TypeScript files (`lib/db/schools-data-*.ts`). At 10–20×
the size it should move into the database:

- `programs`: id, slug, school name, `level` (an enum: d1, d2, d3, naia,
  juco), conference, city, state, gender, academic rank (if sourced).
- `team_ranges`: program_id, floor, middle, top, `source_type`,
  `source_url`, `as_of`, `verified_by`, `created_at`. Several rows per
  program over time; the newest verified one is current.
- RLS: readable by everyone, writable only by the service role (a curator
  tool or a reviewed import), never by clients.
- `lib/fit.ts` and `lib/school-fit.ts` already band by floor and middle and
  need no new maths. They need the `level` enum (NAIA/JUCO aren't divisions
  today), and filters on /schools need the new levels.
- `UTR_RANGE_SOURCE_LABEL` ("Unverified estimate") becomes per-range: the
  real source and date where one exists, the old label only for the 68
  legacy rows until they are re-sourced.

## How many programs are enough

The goal: a typical 5–9 UTR junior sees **at least 10 programs in Target or
Likely** for their own gender.

A program lands in Target/Likely for a player when its floor is at or below
their (projected) rating. So for each half-point of UTR from 5 to 9 the
catalog needs at least ~10–15 programs with a floor at or below it, spread
across regions. Using the planning bands above:

- **Men:** about 120–150 programs with floors between 5 and 9.5 — mostly D3
  and NAIA, plus D2 and JUCO for the bottom of the range.
- **Women:** about 150–180 programs with floors between 4 and 8.5 — D3, NAIA
  and D2.

That is **about 300 new programs** in total (roughly 4–5× today), focused on
D3, NAIA and D2. It is not "every program in the country"; that is phase 3.

## Phased plan

| Phase | What | Programs | Gate to move on |
|---|---|---|---|
| 0 | Schema (`programs`, `team_ranges`), migration, curator import path, source/date shown in the UI, the 68 legacy rows moved across unchanged and still labelled "Unverified estimate" | 68 | Every team number on every screen shows a source and date or the legacy label |
| 1 | D3 + NAIA in the 3–4 regions most players come from, both genders | ~150 | A 5–9 junior in those regions sees ≥10 Target/Likely |
| 2 | D2, JUCO and the rest of D3/NAIA nationally | ~150 more | The same, nationally |
| 3 | Lower D1, a refresh cycle (re-verify anything older than a year), and coach submissions | open-ended | Stale ranges under 10% |

## Effort estimate

- **Engineering (phase 0):** about 1–1.5 weeks for one engineer: the
  migration and RLS, moving the catalog into the database without changing
  any band, a curator import (CSV with required source/date columns, rejected
  if any are missing), per-range source display, new level filters, and
  guard tests (every range must have a source and a date).
- **Data (phases 1–2), hand-curated:** about 20–30 minutes per program to
  find the roster, compute the range by the written rule and record the
  sources, plus a 1-in-5 re-check. ~300 programs ≈ 120–180 hours of careful
  manual work. A licensed feed would replace most of that with an agreement
  and an import job (about a week of engineering once data access exists).
- **Coach submissions:** about 1 week to build (form, domain check, review
  queue); the data then arrives slowly.

## Decisions Niran needs to make

1. Whether to pursue a licensed data feed before starting hand curation.
2. Which regions go first in phase 1.
3. Who does the curation and the 1-in-5 re-check (it can't be the app).
