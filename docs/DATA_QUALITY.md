# Seeded — Data Quality

Data quality *is* the product. A fit band is only as honest as the roster
number behind it.

## Current state (audited 2026-11-10) — honest summary

| Data | Where it lives | Reliability today |
|---|---|---|
| School name, city, state, division, conference | `lib/db/schools-data-*.ts` | PARTIALLY RELIABLE — mostly right from public knowledge, never source-checked, no date |
| `avgRosterUTR`, `minCompetitiveUTR` | same | **UNVERIFIED** — no source, no date, no per-player basis |
| `usNewsRanking` | same | PARTIALLY RELIABLE — no year recorded |
| `conferenceRank` | same | **FABRICATED** — used in coach emails as a fact |
| `coachName`, `coachEmail` | same | **FABRICATED** (e.g. Stanford men "Daniel Whitfield / dwhitfield@stanford.edu") |
| `recentRecruits` | same | **FABRICATED** (invented names, hometowns, UTRs) |
| `programNote` | same | **FABRICATED** prose |
| `recruitingPageUrl` | same | **PLACEHOLDER** (`https://example.com/...`, 68 occurrences) |
| Player UTR history | `utr_entries` (self-reported) | PROVISIONAL — user typed it, no validation beyond range |
| Match results | `matches` | PROVISIONAL — self-reported |
| NCAA contact dates (Plan checklist) | code constants | RELIABLE as general guidance, correctly labeled "confirm at ncaa.org" |

Coverage: 37 men's + ~32 women's programs, almost all D1 power/Ivy plus a
few elite D3. A player at UTR 5.81 has zero programs within range. Most
junior players are below UTR 10 — coverage, not polish, is the gap.

Separate real sources exist but aren't wired in: the "College Tennis UTR
Database" Google Sheet and `claude/official_rosters_2026-27.tsv` in the
Claude project (10 more conferences, no UTRs yet).

## Reliability classes (use these exact values in the DB)

| Class | Meaning | Allowed in fit math? | UI treatment |
|---|---|---|---|
| `verified` | From an official roster page or UTR profile, checked by a human within freshness window, with source URL + date | Yes | Number + "Verified {date}" |
| `reliable` | Official/UTR source, automated or older check, within freshness window | Yes | Number + source date |
| `partially_reliable` | Team aggregate built from < 70% of roster with known UTR | Yes, band confidence = low | Number + "Partial roster" |
| `provisional` | Player self-reported or single unconfirmed source | Player's own UTR only | Number + "Self-reported" |
| `stale` | Past freshness window | No (show, don't compute) | Greyed, "Last checked {date}" |
| `suspicious` | Failed a validation rule | No | Hidden from users, queued for review |
| `unavailable` | No data | No | "Not tracked" — never a placeholder number |

## How unreliable UTRs distort outputs
- **Team averages**: one missing or inflated top player moves a 6-player average by ~0.3–0.5. Require ≥ 70% coverage for `reliable` aggregates.
- **Team floor (`minCompetitiveUTR`)**: the band boundary for Target vs Reach. A wrong floor flips bands directly. Compute it from real lineup players (top 6–8), not the bench.
- **Recommendations / Today actions**: built on bands → inherit every error.
- **Probability**: Seeded deliberately shows bands, not percentages. Keep it that way.
- **Player projections**: one bad self-reported entry dominated the regression in the audited account (projected UTR fell from 5.81 to 4.3). Reject or flag entries that jump > 1.0 from the prior entry inside 30 days.

## Target schema (migration 012 — reserved)
```
roster_sources(id, url, kind['official_roster'|'utr_team'|'sheet'|'tsv'], fetched_at, license_note)
teams(id, slug unique, school_name, gender, division, conference, state,
      head_coach_name null, staff_directory_url null,
      source_id fk, verified_at null, reliability)
players(id, team_id fk, name, class_year, hometown null,
        utr numeric null, utr_reliability, utr_checked_at null,
        status['active'|'graduated'|'transferred'|'inactive'],
        source_id fk, unique(team_id, name, class_year))
team_rating_snapshots(team_id, season, avg_utr, floor_utr, n_players, n_with_utr,
                      reliability, computed_at)
data_audit_log(id, table_name, row_id, field, old, new, changed_by, reason, at)
```
Rules: no row without `source_id`; aggregates are computed by SQL from
`players`, never typed in; coach email is never stored — link the staff
directory instead.

## Validation rules
- UTR between 1.00 and 16.50; men's college floor sanity 6–14, women's 4–12 (flag outside, don't reject).
- `class_year` within current season − 1 … current season + 4.
- Duplicate player = same normalized name + team + class year → merge, log.
- A player appearing on two teams in the same season → `transferred`, flag for review.
- A team aggregate changing by > 1.0 between imports → `suspicious`, hold.

## Freshness
- Rosters: re-verify every season (Aug–Oct). `stale` after 240 days.
- Team UTR aggregates: `stale` after 120 days.
- Coach staff directory links: check quarterly (404 → flag).

## Import procedure (re-runnable)
1. `scripts/import-rosters` reads files passed at runtime (never committed data).
2. Upsert by natural keys; never delete — mark `graduated`/`inactive`.
3. Write every field change to `data_audit_log`.
4. Recompute `team_rating_snapshots`.
5. Failed rows go to an `import_errors` report; the run fails if > 5% of rows error. Nothing partial is published.
6. Run on staging, review diff, then prod — with sign-off.

## Manual verification
Admin-only (service role, not a UI for normal users) for V1: a SQL/notebook
workflow to mark a team `verified` with a URL and date. A real admin UI is
POST-V1; normal users must never get admin privileges.

## Licensing — REQUIRES LEGAL/ADULT REVIEW
- Official athletics roster pages: public, but check each site's terms before automated collection; manual entry with citation is safest.
- UTR: the product rule is "profile link + manual check-in only, never fetch or scrape UTR." Team UTR numbers must come from a permitted source.
- Never present any data source as an official partner.
