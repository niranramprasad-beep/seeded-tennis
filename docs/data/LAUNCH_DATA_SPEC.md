# Launch data spec — College Tennis UTR Database (2026-11-22)

The field checklist for the 2026-11-22 collection run (SEC, then Big Ten).
Every value carries a source URL and a read date, or it is blank with a note.

## 1. What the app reads today

| App surface | Reads | From |
|---|---|---|
| Importer `lib/catalog/utr-database.ts` | Teams: Division, Conference, School, Team UTR Link, Gender, Head Coach, Team Avg UTR (reliable only), Official Roster URL, Last Verified, Leaving by Spring 2027/2028. Players: Division, Gender, School, UTR Rating, Reliable? (Y/N), Roster Check, Grad Year | the sheet (CSV export of the two tabs) |
| `/schools` catalog section (`components/schools/imported-programs-section.tsx`, `lib/db/programs.ts`) | programs: school, gender, division, conference, roster_url, season_shown, players_listed, unknown_class_count, source_date; class counts; team range (low/middle/high + source + date) | Supabase `programs`, `program_class_counts`, `team_ranges` (migration 048) |
| Fit report (`lib/school-fit.ts`) | team range floor (Q1) and middle (median); legacy `avgRosterUTR` / `minCompetitiveUTR` (labelled unverified) | `team_ranges`; legacy `lib/db/schools-data-*.ts` |
| Outreach / coach email (`lib/db/schools.ts`) | school short name only. The "To" address is typed by the user; staff contacts are found by a web search. No coach name or email is stored in app code (P0-3 guard) | — |
| Cost calculator, school city/state, US News rank | legacy `lib/db/schools-data-*.ts` (city/state partly reliable, US News has no year) | code constants |
| Not stored anywhere yet | assistant coaches, published coach emails, coaches page, questionnaire URL, ITA ranking, cost of attendance, acceptance rate, enrollment | — (collected now in a new tab; wiring them into the app is a separate, later change) |

Head coach is stored in `programs.head_coach` but not rendered in phase 1.

## 2. Sheet layout (live, 2026-11-22) — do not rename, reorder or delete

- **Teams** (A–M): Division | Conference | School | Team UTR Link | Gender | Head Coach | Team Avg UTR (reliable only) | Team Avg UTR (all) | # Players Excluded | Leaving by Spring 2027 | Leaving by Spring 2028 | Official Roster URL | Last Verified
- **Players** (A–N): Division | Gender | School | Team UTR Link | Player Name | Player UTR Link | Class Year | UTR Rating | Reliable? (Y/N) | Exclusion Note | Roster Check | Grad Year | Doubles UTR | Doubles Reliable? (Y/N)
- **Progress** (A–G): Division | Gender | Conference | School | Status | Updated | Notes

New columns are appended at the end only:
- **Players** O–P: Hometown | UTR Read Date
- **Teams** N–R: Reliable UTR Count | UTR Q1 (QUARTILE inc, k=1) | UTR Median | UTR Top | Roster Season Shown

New tab **Program Info** (one row per team): Division | Gender | School | Conference | Conference Source URL | City | State | Head Coach | Head Coach Title | Assistant Coaches (name — title; …) | Published Staff Emails (name: email; …) | Staff Email Source URL | Coaches Page URL | Recruiting Questionnaire URL | Roster Status (CURRENT/STALE) | Players Listed | Freshmen | Sophomores | Juniors | Seniors | Grad/5th | Leaving After 2026-27 (seniors + grad/5th) | ITA Rank | ITA Source URL | ITA Date | Cost of Attendance (USD) | COA Year | COA Source URL | Acceptance Rate | Undergrad Enrollment | Scorecard Source URL | School Data Read Date | Notes

New tabs **Staging Teams / Staging Players / Staging Program Info**: same columns as the live tabs. Collectors write there (or to files) first; only teams that pass the quality gate are copied to the live tabs.

## 3. Rules
- Rosters and coaches: the school's official athletics site only (fallbacks: /roster/2026-27, ?view=2, ?view=list, ?print=true, /coaches).
- Season must be 2026-27. A 2025-26-only roster is STALE: it is recorded but **not** imported (the importer stamps one season on every program).
- UTR: read in the owner's signed-in Chrome at human pace. The team's UTR college roster page is read once; a single player's profile is opened only when they are missing from it or a match is unclear. Match = name AND one of hometown, country, college or age. Two possible profiles → blank + flag.
- Unreliable ratings (under 100%, asterisk/stale, estimated) are recorded and excluded from team stats.
- "UTR only" = on UTR's team page but not on the official roster: listed, excluded from every count and stat.
- Team stats are computed by code from the player rows: reliable count, Q1 = Sheets QUARTILE(…,1) (inclusive), MEDIAN, MAX, mean (the existing "Team Avg UTR (reliable only)").
- Leaving = Grad Year 2027 (seniors, grad students, 5th years) on the official roster.
- Cost of attendance, acceptance rate, enrollment: College Scorecard or the school's official cost page, with URL + date. ITA ranking: ITA's own rankings page, with date. NCAA roster/scholarship rules: official NCAA sources only (section 5).
- Coach emails: only when printed on the official staff directory or coaches page. Never inferred from a pattern.

## 4. Quality gate (per team)
1. Player count equals the official page; season 2026-27 or marked STALE.
2. An independent verifier re-checks a random 25% of player rows, the head coach and every team stat. Any mismatch → whole team re-checked.
3. Q1 / median / top / mean recomputed by code equal the sheet.
4. No duplicate players; no player on two teams.

## 5. NCAA roster and scholarship rules
Filled in from official NCAA sources during the run (see the run report).
