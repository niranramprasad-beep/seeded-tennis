# Catalog phase 1 — roster import

Written 2026-11-19 for PR E. Plan: `docs/CATALOG_EXPANSION.md`. Rules:
`CLAUDE.md` (no invented data; UTR is never fetched or scraped; "Not tracked"
for missing data; source and date beside every roster number).

## Status: pending the input file

**The input file does not exist yet.** The brief names
`docs/data/official_rosters_2026-27.tsv` (about 1,947 player rows across ten
conferences: NESCAC, Centennial, ODAC, Patriot League, UAA, SCIAC, Liberty
League, CAA, Ivy League, Atlantic 10). It is not in the repo, on any branch,
or on disk, and it has not been reconstructed or guessed. Everything below
the "Results" heading is therefore **pending**: the table shapes are here,
with no numbers, and the importer fills them in the moment the file is added.

Everything else is built and tested against a fake fixture
(`lib/catalog/testdata/rosters-fixture.tsv` — "Test College A", "Player 1",
"Test Town").

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

# 1. Read only: summary JSON + regenerate the Results block below.
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on YYYY-MM-DD

# 2. Optional: name programs you expect, so missing teams are listed.
#    A TSV with Conference, School, Gender columns.
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on YYYY-MM-DD --expected path/to/expected-programs.tsv

# 3. Write to STAGING (refuses production by URL and by key).
SUPABASE_URL=https://gnlcpnsweqbtwpaqhqqg.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<staging service key> \
npx vite-node --config vitest.config.ts scripts/import-rosters.ts -- \
  --checked-on YYYY-MM-DD --upsert
```

`--checked-on` is required: it is the date the rosters were read, and it is
shown beside every count in the app ("4 seniors on the 2025-26 roster,
checked Nov 19, 2026"), so it is never defaulted. `--file` overrides the
input path. The run fails, and nothing is upserted, if more than 5% of rows
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

## Known caveats of the input, and what happens

- **Some rosters are 2025-26.** Kept, labelled with their own season, listed
  below. The app says "This is the 2025-26 roster, not the current season's.
  Its seniors have already finished."
- **Some teams are missing.** The roster file alone cannot show a team that
  has no rows. Pass `--expected` to list them.
- **Class labels vary by school.** Handled above; unknowns are never guessed.
- **Spellings were not hand-checked.** School names are stored as written.
  The same school under two conferences or spellings that slug the same is
  refused, not merged.

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
_Pending the input file. The importer replaces this block._

### Programs by conference and gender

| Conference | Division | Men | Women | Players listed |
| --- | --- | --- | --- | --- |
| NESCAC | D3 | pending | pending | pending |
| Centennial | D3 | pending | pending | pending |
| ODAC | D3 | pending | pending | pending |
| UAA | D3 | pending | pending | pending |
| SCIAC | D3 | pending | pending | pending |
| Liberty League | D3 | pending | pending | pending |
| Patriot League | D1 | pending | pending | pending |
| CAA | D1 | pending | pending | pending |
| Ivy League | D1 | pending | pending | pending |
| Atlantic 10 | D1 | pending | pending | pending |
| **Total** | | pending | pending | pending |

### Programs missing

Pending.

### Rosters from an earlier season

| School | Gender | Season shown |
| --- | --- | --- |
| pending | pending | pending |

### Unreadable class labels

Pending.

### Row errors

Pending.

### Team ranges

Imported programs with no range: **all of them** (pending the count), until
the owner enters ranges.

### Coverage for sample players (today's rating, no projection)

| Player | Imported programs rated | Imported not rated | Target (imported) | Likely (imported) | Target (legacy catalog, unverified) | Likely (legacy catalog, unverified) |
| --- | --- | --- | --- | --- | --- | --- |
| Men's UTR 5 | pending | pending | pending | pending | pending | pending |
| Men's UTR 7 | pending | pending | pending | pending | pending | pending |
| Men's UTR 9 | pending | pending | pending | pending | pending | pending |
| Women's UTR 5 | pending | pending | pending | pending | pending | pending |
| Women's UTR 7 | pending | pending | pending | pending | pending | pending |
| Women's UTR 9 | pending | pending | pending | pending | pending | pending |

Imported programs count toward Target/Likely only once they have a sourced
range, so until ranges are entered the imported columns will read 0.
<!-- import-report:end -->
