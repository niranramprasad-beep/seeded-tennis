# Catalog phase 1 — roster import

Written 2026-11-19 for PR E. Plan: `docs/CATALOG_EXPANSION.md`. Rules:
`CLAUDE.md` (no invented data; UTR is never fetched or scraped; "Not tracked"
for missing data; source and date beside every roster number).

## Status: imported to staging 2026-11-20

The file arrived as `docs/data/official_rosters_2026-27.tsv` (1,947 player
rows, one per student, with names and hometowns). **Since 2026-11-21 that raw
file is not in the repo** (it names ~1,900 real students): it lives only on
the owner's machine at `~/seeded-private/official_rosters_2026-27.tsv`, and
the repo holds its aggregate, `docs/data/roster_counts_2026-27.tsv` — one
row per team (conference, school, gender, head coach, roster URL, season,
players per graduating class, total), no player names, hometowns or notes.
`scripts/aggregate-rosters.ts` turns the raw file into the aggregate and
refuses to write unless reading it back gives exactly the raw parse and no
name, hometown or note appears in it. The importer reads either format and
gives the same drafts. It covers ten conferences: NESCAC, Centennial, ODAC, Patriot League, UAA, SCIAC,
Liberty League, CAA, Ivy League, Atlantic 10), rosters read 2026-11-08.

- **Parsed:** all 1,947 rows, 0 row errors. 179 teams imported.
- **Staging** (`gnlcpnsweqbtwpaqhqqg`) holds all 179 programs and 663
  class-count rows. Checked by md5 of every stored field against the parser's
  own output: identical. No team ranges.
- **Production:** nothing. Migration 048 is not on production and the
  `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED` flag is not set there.
- **Which teams should exist** comes from each conference's own standings or
  membership page: `docs/data/expected_programs_2026-27.tsv` (191 teams,
  source URL on every row). CAA and Atlantic 10 publish no standings page, so
  those rows cite a membership page, a preseason poll and a championship
  field instead.

The fake fixture (`lib/catalog/testdata/rosters-fixture.tsv` — "Test College
A", "Player 1", "Test Town") still drives the unit tests; the real file has
its own regression tests.

## What is imported, and what is not

| Stored (migration 048) | Not stored |
|---|---|
| `programs`: school, gender, division (from the conference), conference, head coach as printed, roster URL, season shown, players listed, players whose class could not be read, date read | Player names |
| `program_class_counts`: players per graduating class year | Hometowns |
| `team_ranges`: low / middle / high, source type, source, source URL, source date, who entered it — **entered by the owner only** | Notes column |
| | Any UTR from the roster file (it has none) |

Player and Hometown are read only to drop exact duplicate rows, in memory.
They are never written to the database, the JSON summary, or this report.

## How to run it

```
cd /Users/niranram/seeded-tennis

# 0. Only when the raw file changes (owner's machine): rebuild the aggregate.
npx vite-node --config vitest.config.ts scripts/aggregate-rosters.ts -- \
  --in ~/seeded-private/official_rosters_2026-27.tsv

# 1. Read only: summary JSON + regenerate the Results block below.
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on YYYY-MM-DD

# 2. Name the teams each conference lists, so missing teams are named.
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on 2026-11-08 --expected docs/data/expected_programs_2026-27.tsv

# 2b. No service key at hand: write the same rows as SQL for a STAGING SQL
#     session. It refuses any database without migration 048.
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on 2026-11-08 --emit-sql /tmp/staging-import.sql

# 3. Write to STAGING (refuses production by URL and by key).
SUPABASE_URL=https://gnlcpnsweqbtwpaqhqqg.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<staging service key> \
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on YYYY-MM-DD --upsert
```

`--checked-on` is required: it is the date the rosters were read, and it is
shown beside every count in the app ("4 seniors on the 2025-26 roster,
checked Nov 19, 2026"), so it is never defaulted. `--file` overrides the
input path (the aggregate by default; a raw file kept outside the repo also
works). The run fails, and nothing is upserted, if more than 5% of rows
have errors (`docs/DATA_QUALITY.md`).

## How class labels are read

`lib/catalog/class-year.ts`, relative to the season the roster shows:
first-year = start + 4, sophomore + 3, junior + 2, senior + 1; graduate,
5th- and 6th-year = start + 1 (final season); `'30` / `2030` /
`Class of 2030` = that year if it is plausible for the roster; redshirt
labels map by the eligibility year printed (R-Fr = Fr). Anything else —
`Fr/So`, a blank cell, a year no one on that roster can hold — is counted as
**unknown**, shown per program ("2 of 9 listed players had a class year we
could not read, so the count may be low"), and tallied below.

"Seniors" in the app means every player in their final season on that
roster: seniors, graduate students and 5th-years.

## What the real file broke, and what happens now

- **Teams with no roster.** Ten rows name a team whose roster page did not
  load, was blocked by robots.txt, or rendered no player table. Most had a
  blank SeasonShown, so they were row errors. They are now "roster not
  retrieved": not a row error, not imported (a team with no roster would
  read "0 seniors", which is not known), and listed under Teams missing.
  Their Notes cell is never copied: on this file it quotes player names.
- **A single year as the season.** Whittier's pages say "2026" (spring 2026).
  `parseRosterSeason` reads a bare year as the season that spring ends,
  2025-26, and flags it. That reading can only make a roster look older,
  never newer, so it cannot overstate seniors leaving. `parseSeason` itself
  stays strict.
- **Year and class together.** "Fr. '30", "So. '29", "Sr. '27": both halves
  are read and the year is used only when they agree.
- **A roster with no class column** (Davidson women, 2025-26). Its 10
  players count as listed with every class unknown, and the app says "Not
  tracked", never "0 seniors".
- **Earlier-season rosters.** Seven, in four spellings ("2025-26",
  "2025-2026", "2026"). Kept, labelled with their own season.
- **Missing hometowns.** Harmless: hometowns are only used in memory to drop
  exact duplicate rows, and a blank one never merges two different players.
- **Same team in the existing 68-program catalog.** 18 imported teams are
  the same team as a legacy entry under a longer name ("Penn" =
  "University of Pennsylvania", "Chicago" = "University of Chicago").
  `lib/catalog/legacy-match.ts` matches on gender + conference + the name
  with filler words dropped, plus a short alias list. They are stored, and
  /schools does not list them a second time.
- **Spellings.** The conference lists say "Conn. College" and "UNCW"; two
  aliases make those agree with the file.
- **Unreadable labels left:** "Rs." (no year) once, and the Davidson blanks.

## Team ranges

None of the imported programs has a team UTR range, and none can get one
from this import: the roster file has no ratings, and the app may not fetch
or scrape any. Each range is entered by the owner at `/admin/team-ranges`
with a source type, a source, an optional link and the date the source was
read. Until then every imported program reads **"Level not rated yet"** and
is excluded from every band — never Target, never Likely, never passed to
`classifySchoolFit`. A range older than 365 days is shown greyed and also
excluded.

To become an admin (once, in the Supabase SQL editor for the project in
question): `insert into public.app_admins (user_id, note) values ('<your auth user id>', 'owner');`

## Results

<!-- import-report:begin -->
_Generated by `scripts/import-rosters.ts` from `roster_counts_2026-27.tsv`, rosters read 2026-11-08 (current season 2026-27). 1947 rows read, 1947 used, 0 error(s), error rate 0.0%._

### Programs by conference and gender

| Conference | Division | Men | Women | Players listed |
| --- | --- | --- | --- | --- |
| Atlantic 10 | D1 | 6 | 9 | 137 |
| CAA | D1 | 10 | 12 | 178 |
| Centennial | D3 | 9 | 10 | 241 |
| Ivy League | D1 | 6 | 7 | 153 |
| Liberty League | D3 | 9 | 9 | 184 |
| NESCAC | D3 | 11 | 11 | 255 |
| ODAC | D3 | 10 | 12 | 210 |
| Patriot League | D1 | 9 | 9 | 199 |
| SCIAC | D3 | 8 | 8 | 187 |
| UAA | D3 | 7 | 7 | 193 |
| **Total** |  | 85 | 94 | 1937 |

11 listed player(s) had a class label the importer could not read; they count toward "players listed" and toward no class.

### Per conference: imported, missing, stale

| Conference | Division | Teams imported | Roster not retrieved | Not in the file | Stale rosters | Players listed |
| --- | --- | --- | --- | --- | --- | --- |
| Atlantic 10 | D1 | 15 | 5 | 2 | 3 | 137 |
| CAA | D1 | 22 | 0 | 0 | 0 | 178 |
| Centennial | D3 | 19 | 0 | 0 | 0 | 241 |
| Ivy League | D1 | 13 | 3 | 0 | 0 | 153 |
| Liberty League | D3 | 18 | 0 | 0 | 0 | 184 |
| NESCAC | D3 | 22 | 0 | 0 | 0 | 255 |
| ODAC | D3 | 22 | 0 | 0 | 0 | 210 |
| Patriot League | D1 | 18 | 0 | 0 | 2 | 199 |
| SCIAC | D3 | 16 | 0 | 0 | 2 | 187 |
| UAA | D3 | 14 | 2 | 0 | 0 | 193 |
| **Total** |  | 179 | 10 | 2 | 7 | 1937 |

"Teams missing" = "Roster not retrieved" (the file names the team but has no roster for it) plus "Not in the file" (on the expected list, absent from the file).

### Teams missing

| Conference | School | Gender | Why |
| --- | --- | --- | --- |
| Atlantic 10 | George Mason | men | Roster not retrieved when the file was compiled |
| Atlantic 10 | George Mason | women | Roster not retrieved when the file was compiled |
| Atlantic 10 | Richmond | men | Roster not retrieved when the file was compiled |
| Atlantic 10 | St. Bonaventure | men | Roster not retrieved when the file was compiled |
| Atlantic 10 | St. Bonaventure | women | Roster not retrieved when the file was compiled |
| Ivy League | Brown | men | Roster not retrieved when the file was compiled |
| Ivy League | Dartmouth | men | Roster not retrieved when the file was compiled |
| Ivy League | Princeton | women | Roster not retrieved when the file was compiled |
| UAA | Carnegie Mellon | men | Roster not retrieved when the file was compiled |
| UAA | Carnegie Mellon | women | Roster not retrieved when the file was compiled |
| Atlantic 10 | Saint Louis | men | Not in the file |
| Atlantic 10 | Saint Louis | women | Not in the file |

### Already in the main catalog

18 imported teams are the same team as an entry in the existing catalog. They are stored, but /schools does not list them a second time:

| Imported | Existing catalog entry |
| --- | --- |
| `johns-hopkins-men` | `johns-hopkins-m` |
| `johns-hopkins-women` | `johns-hopkins-w` |
| `columbia-men` | `columbia-m` |
| `columbia-women` | `columbia-w` |
| `cornell-men` | `cornell-m` |
| `cornell-women` | `cornell-w` |
| `harvard-men` | `harvard-m` |
| `harvard-women` | `harvard-w` |
| `penn-men` | `penn-m` |
| `princeton-men` | `princeton-m` |
| `yale-men` | `yale-m` |
| `yale-women` | `yale-w` |
| `middlebury-men` | `middlebury-m` |
| `middlebury-women` | `middlebury-w` |
| `chicago-men` | `chicago-m` |
| `chicago-women` | `chicago-w` |
| `emory-men` | `emory-m` |
| `emory-women` | `emory-w` |

### Rosters from an earlier season

| School | Gender | Season shown |
| --- | --- | --- |
| Davidson | women | 2025-26 |
| Duquesne | women | 2025-26 |
| Saint Joseph's | women | 2025-26 |
| Colgate | women | 2025-26 |
| Lehigh | men | 2025-26 |
| Whittier | men | 2025-26 |
| Whittier | women | 2025-26 |

These show as "the 2025-26 roster" in the app, with a note that its seniors have already finished.

2 roster(s) printed a single year (e.g. "2026") rather than a season. College tennis plays its championship season in the spring, so these are read as the season that spring ends (2026 -> 2025-26): `whittier-men`, `whittier-women`.

### Seniors leaving (current-season rosters only)

| Gender | Programs counted | Seniors leaving | Current-season rosters with no readable class years |
| --- | --- | --- | --- |
| Men | 83 | 206 | 0 |
| Women | 89 | 198 | 0 |

"Seniors" = every player in their final season on that roster (seniors, graduate students, 5th-years). Earlier-season rosters are left out: their seniors have already finished.

### Where to enter team ranges first (20)

| # | Program | Division | Conference | Seniors leaving | Players listed |
| --- | --- | --- | --- | --- | --- |
| 1 | Averett (Women) | D3 | ODAC | 6 | 6 |
| 2 | Redlands (Men) | D3 | SCIAC | 6 | 15 |
| 3 | Drexel (Men) | D1 | CAA | 6 | 9 |
| 4 | Navy (Men) | D1 | Patriot League | 6 | 19 |
| 5 | Chapman (Men) | D3 | SCIAC | 5 | 16 |
| 6 | Franklin & Marshall (Women) | D3 | Centennial | 5 | 14 |
| 7 | Randolph (Men) | D3 | ODAC | 5 | 12 |
| 8 | Army West Point (Women) | D1 | Patriot League | 5 | 16 |
| 9 | UNC Wilmington (Women) | D1 | CAA | 5 | 7 |
| 10 | Amherst (Men) | D3 | NESCAC | 4 | 11 |
| 11 | Batten (Men) | D3 | ODAC | 4 | 11 |
| 12 | Bridgewater (Men) | D3 | ODAC | 4 | 13 |
| 13 | Caltech (Men) | D3 | SCIAC | 4 | 11 |
| 14 | Case Western Reserve (Men) | D3 | UAA | 4 | 25 |
| 15 | Gettysburg (Men) | D3 | Centennial | 4 | 26 |
| 16 | Muhlenberg (Men) | D3 | Centennial | 4 | 10 |
| 17 | Muhlenberg (Women) | D3 | Centennial | 4 | 9 |
| 18 | Skidmore (Men) | D3 | Liberty League | 4 | 9 |
| 19 | St. Lawrence (Women) | D3 | Liberty League | 4 | 10 |
| 20 | William Smith (Women) | D3 | Liberty League | 4 | 13 |

Order: most seniors leaving first; D3 and the non-Ivy D1 conferences only; ties go to D3. Current-season rosters only, and not the teams already in the main catalog. This is where a range helps a UTR 5–8 junior soonest; it says nothing about any team's level.

### Unreadable class labels

| Label as written | Rows |
| --- | --- |
| (blank) | 10 |
| Rs. | 1 |

### Row errors

None.

### Team ranges

0 of 179 imported programs have a current, sourced team range; 179 show "Level not rated yet" and are excluded from every band.

### Coverage for sample players (today's rating, no projection)

| Player | Imported programs rated | Imported not rated | Target (imported) | Likely (imported) | Target (legacy catalog, unverified) | Likely (legacy catalog, unverified) |
| --- | --- | --- | --- | --- | --- | --- |
| Men's UTR 5 | 0 | 75 | 0 | 0 | 0 | 0 |
| Men's UTR 7 | 0 | 75 | 0 | 0 | 0 | 0 |
| Men's UTR 9 | 0 | 75 | 0 | 0 | 0 | 0 |
| Women's UTR 5 | 0 | 86 | 0 | 0 | 0 | 0 |
| Women's UTR 7 | 0 | 86 | 0 | 0 | 0 | 0 |
| Women's UTR 9 | 0 | 86 | 0 | 0 | 8 | 0 |

Imported programs count only once the owner enters a sourced range for them. The legacy columns are the existing catalog, whose ranges are all labelled "Unverified estimate".
<!-- import-report:end -->
