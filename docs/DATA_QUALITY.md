# Seeded — Data Quality

Data quality *is* the product. A fit band is only as honest as the roster
number behind it.

## Current state (2026-11-20)

| Data | Where it lives | Reliability today |
|---|---|---|
| School name, city, state, division, conference | `lib/db/schools-data-*.ts` | PARTIALLY RELIABLE — from public knowledge, never source-checked, no date |
| `avgRosterUTR`, `minCompetitiveUTR` | same | **UNVERIFIED** — no source, no date, no per-player basis. Labelled "Unverified estimate" (`UTR_RANGE_SOURCE_LABEL`) wherever it renders |
| `usNewsRanking` | same | PARTIALLY RELIABLE — no year recorded |
| Coach names/emails, recent recruits, conference rank, program blurbs, recruiting URLs | — | **REMOVED** (P0-3). All were invented. The outreach "To" field is typed by the user per draft; staff contacts are found through a web search (`staffDirectorySearchQuery()` in `lib/db/schools.ts`), never a guessed URL |
| Player UTR history | `utr_entries` | PROVISIONAL — self-reported; DB CHECK 1–16.5, no outlier check yet |
| Match results | `matches` | PROVISIONAL — self-reported |
| Tournament verdicts | `/tournament-fit` | Need the draw's average UTR from the user; there is no level-to-UTR table (it had no source) |
| NCAA contact dates (Plan checklist) | code constants | RELIABLE as general guidance, labelled "confirm at ncaa.org" |

**Coverage:** 68 programs — 37 men's, 31 women's, almost all upper D1 (see
the table in `docs/CATALOG_EXPANSION.md`). A typical junior at UTR 5–9 sees
almost nothing in Target or Likely. Coverage, not polish, is the gap.

### Guards (fail the build)
- `lib/db/schools-catalog-honesty.test.ts` — any catalog entry growing a
  coach name/email, recruit list, conference rank, program blurb, URL,
  email-shaped string, or **any field outside the explicit allowlist**.
  Adding a real, sourced field means editing that allowlist deliberately.
- `lib/no-invented-school-data.test.ts`, `lib/no-invented-goal.test.ts`,
  `lib/utr-sentinel.test.ts`, `lib/pace-honesty.test.ts` and the fit-band
  tests — see CLAUDE.md for what each protects.

## The fix in progress: PR E (catalog phase 1)
Migration 048 (PR E #9, merged to `main` 2026-11-20; on production since
2026-11-20 23:55 UTC with **no rows** — staging holds the imported rows, and
the reading code is behind a flag that is off) moves the catalog into the database:
- `programs` + `program_class_counts` — that a program exists and how many
  rostered players are in each graduating class, from the program's own
  roster page on a known date. Service-role writes only, by
  `scripts/import-rosters.ts`, which refuses to run against production. **No
  player names or per-player rows are stored.**
- `team_ranges` — a team's UTR range, entered by an app admin one range at a
  time, each with its own source and date. Insert-only; a correction is a
  new row. A program with no range has no level and never reaches
  `classifySchoolFit` ("Level not rated yet").

This supersedes the 2026-11-10 draft (a reserved migration `012` with
per-player rows). Plan and sizing: `docs/CATALOG_EXPANSION.md`.

## Reliability classes

| Class | Meaning | Allowed in fit math? | UI treatment |
|---|---|---|---|
| `verified` | From an official roster page or UTR profile, checked by a human within the freshness window, with source URL + date | Yes | Number + its source and date (never "Verified" — see below) |
| `reliable` | Official/UTR source, automated or older check, within window | Yes | Number + source date |
| `partially_reliable` | Team aggregate built from < 70% of roster with known UTR | Yes, low confidence | Number + "Partial roster" |
| `provisional` | Self-reported or single unconfirmed source | Player's own UTR only | Number + "Self-reported" |
| `stale` | Past freshness window | No (show, don't compute) | Greyed, "Last checked {date}" |
| `suspicious` | Failed a validation rule | No | Hidden, queued for review |
| `unavailable` | No data | No | "Not tracked" — never a placeholder number |

**Wording rule (2026-11-21):** a team range is never labelled "Verified" in
the UI, whatever its class. Seeded cannot verify a range — it can only say
where it came from and when. The label names the source and its date — the
phase-1 code renders `"{source type}: {source}, {date}"` with the source link
(`lib/catalog/programs.ts`), e.g. "Hand-curated from public sources: …" —
"Level not rated yet" (`LEVEL_NOT_RATED`) when a program has no range, and "Unverified estimate"
(`UTR_RANGE_SOURCE_LABEL`) for today's unsourced catalog numbers. The
dev-only design-system preview still shows a "Verified" chip; no real range
uses it.

## How unreliable UTRs distort outputs
- **Team averages:** one missing or inflated top player moves a 6-player
  average by ~0.3–0.5.
- **Team floor (`minCompetitiveUTR`):** the Target/Reach boundary. A wrong
  floor flips bands directly.
- **Today actions / recommendations:** built on bands, so they inherit every
  error.
- **Probability:** Seeded shows bands, never percentages. Keep it that way.
- **Projections:** one bad self-reported entry can dominate the trend. Fit
  bands already plan with `min(own pace, 1.5/yr)` (`lib/fit.ts`), which
  limits the damage upward; flagging an entry that jumps > 1.0 within 30
  days is still not built.

## Validation rules (for imports)
- UTR between 1.00 and 16.50; flag (don't reject) men's floors outside 6–14
  and women's outside 4–12.
- `class_year` within current season − 1 … + 4.
- A team aggregate changing by > 1.0 between imports → `suspicious`, hold.

## Freshness
- Rosters: re-verify every season (Aug–Oct); `stale` after 240 days.
- Team UTR ranges: `stale` after 120 days.

## Licensing — REQUIRES ADULT/LEGAL REVIEW
- Official athletics roster pages are public, but check each site's terms
  before automated collection; manual entry with citation is safest.
- UTR: "profile link + manual check-in only, never fetch or scrape". Team
  UTR numbers must come from a permitted source.
- Never present any data source as an official partner.
