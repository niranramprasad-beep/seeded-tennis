# GO sequence — v1 to production

Written 2026-11-16 by the overnight pass. **Nothing here has been run
against production.** Every database step below was rehearsed three times on
staging (`gnlcpnsweqbtwpaqhqqg`), the last from a database whose schema
fingerprint matched production 9 of 9 — see `docs/HANDOFF.md` §J for the
long-form verify and rollback of each step. This file is the order, the
stops, and where each pasteable rollback lives.

**Production:** Supabase `tfpjssmhiptbwigarxpx` (23 migrations applied),
`main` at `d059006` serving the maintenance 503.
**Who runs it:** Niran, or Claude on Niran's explicit current-turn "go"
(given 2026-11-16; the run's log is in `docs/MASTER_ROADMAP.md`).

Shell notes for this Mac: the Postgres client tools are Homebrew `libpq`,
which is keg-only, so use full paths (or `export
PATH="/opt/homebrew/opt/libpq/bin:$PATH"` in that terminal first). Load the
connection without printing it:

```bash
set -a; source ~/seeded-backup.env; set +a
```

> `~/seeded-backup.env` holds production credentials and is currently
> world-readable (`-rw-r--r--`). `chmod 600 ~/seeded-backup.env` before you
> start.

---

## 0. Pre-flight (10 min) — STOP if any check fails

- [ ] `verify` CI is green on the v1 → main PR (typecheck, lint, tests, build).
- [ ] Production has exactly **23** migrations (Supabase → Database →
      Migrations, or `list_migrations`). More = someone changed it; stop.
- [ ] Supabase → Database → Backups: note the latest PITR point: ______
- [ ] Open `docs/HANDOFF.md` §J beside this file. Every rollback below is a
      pasteable block there; have the next step's open before you run a
      step.

## 1. Backup to disk (5 min)

```bash
mkdir -p ~/seeded-backups
/opt/homebrew/opt/libpq/bin/pg_dump "$PROD_DB_URL" --format=custom --no-owner --file ~/seeded-backups/prod-$(date +%Y%m%d-%H%M).dump
```

```bash
/opt/homebrew/opt/libpq/bin/pg_restore --list ~/seeded-backups/prod-*.dump | grep -c "TABLE DATA"
```

**Stop unless** the dump file is non-empty and `pg_restore --list` lists
table data for `profiles`, `utr_entries`, `parent_accounts`, `families`.

## 2. JSON snapshot of the rows the migrations touch (2 min)

```bash
/opt/homebrew/opt/libpq/bin/psql "$PROD_DB_URL" -At -c "select json_build_object('profiles', (select json_agg(p) from (select id, role, family_code, subscription_tier, whop_membership_id, privacy_level, deletion_requested_at from public.profiles) p), 'parent_accounts', (select json_agg(a) from public.parent_accounts a), 'families', (select json_agg(f) from public.families f))" > ~/seeded-backups/prod-snapshot-$(date +%Y%m%d-%H%M).json
```

## 3. Migrations, in the rehearsed order

Apply each file's contents in the Supabase SQL editor (production project),
run its verify, and only then go on. Database time for the whole forward
run was **218 ms** in rehearsal; budget the window for *reading results*,
roughly **45–60 minutes** in total.

| # | migration | pre-flight / verify (detail in §J) | STOP if | rollback |
|---|---|---|---|---|
| 1 | 025 | verification block at the file's end returns 0 rows | any row | §J Step 1 (no-op) |
| 2 | 022 | as an `authenticated` user (not postgres): 4 privileged-column writes → 42501, a `name` edit succeeds | any write allowed | §J Step 2 block |
| 3 | 023 + 026 | `parent_accounts` count before = count `approved` after; 0 `pending` | counts differ | §J Step 3 block |
| 4 | 024 | 0 free accounts holding > 3 targets | > 0 | §J Step 4 block |
| 5 | 027 | rows with `privacy_level='public'` = the known one | different | §J Step 5 block |
| 6 | 028 | `consume_rate_limit('data_export')`: 3 allowed, 4th denied | otherwise | §J Step 6 block |
| 7 | 029 | `select count(*) from profiles where deletion_requested_at is not null` (was 0 on 2026-11-14) | > 0 → handle by hand first | §J Step 7 block |
| 8 | **030**, check, then 031 | **immediately after 030: every profile `consent_status = 'not_required'`, 0 `pending`** (expect 8 of 8 on production, not staging's 12) | **any pending — this is the step that can lock real users out** | §J Step 8 block (drop function first) |
| 9 | 032 | takeover INSERT with a taken code → 42501; a fresh code still works | allowed | §J Step 9 block |
| 10 | 033 | player writes a "parent" note → 42501; approved parent still can | otherwise | §J Step 10 block |
| 11 | 034 | 20 direct `utr_entries` writes allowed, 21st refused | otherwise | §J Step 11 block |
| 12 | **035** (never skip: without it 032/033 break every profile write) | a normal profile upsert succeeds; `delete_my_account()` works on a throwaway | either fails | §J Step 12 block |
| 13 | 036 | a joined parent reads the player's UTR rows; a stranger reads 0 | otherwise | §J Step 13 block |
| 14 | 037 | an approved member reads exactly **1** `profiles` row — **with `set local role authenticated`**, or the count is meaningless | ≠ 1 | §J Step 14 block |
| 14b | 038 | `family_members()` returns one row per member, one account holder | duplicates | §J Step 14b block |
| 14c | 039 | `parent_reports` client INSERT → 42501 | allowed | §J Step 14c block |
| 14d | **040** (needs 035's `profile_row_exists()`) | as an over-limit Free player: same-size upsert and 5 → 4 succeed; 6 and 3 → 4 refused (23514) | otherwise | §J Step 14d (re-run 024's function) |

**040 was added on 2026-11-16, during the production run.** Step 4's
pre-check found 2 real Free players holding 5 target schools; 024 as written
refused every profile save for them (the app upserts the whole profile) and
refused pruning one school at a time. 040 makes the cap block only growth.
Rehearsed on staging before and after, against that exact shape. It runs
last because it calls 035's `profile_row_exists()`; the defect only bites
once the v1 code is live, and the code merges after it.

**036 does not ship without 037, 038 and 039.** If you have to stop after
036, roll 036 back rather than leave it alone.

After step 14c: re-run the schema fingerprint; production should now match
staging.

### 3b. PR B migrations

**PR B — 041, 042, 043, 044, 045 (041–044 written 2026-11-18, 045 on
2026-11-19; rehearsed on staging). RUN ON PRODUCTION 2026-11-19, 13:08–13:10
UTC, on Niran's go, after a full backup; every row's verify passed and
nothing was rolled back. PR B merged right after.** Run after the steps above are live and before the PR B code
merges, each on Niran's explicit go. Detail, staging probe results and the
pasteable rollbacks: `docs/HANDOFF.md` §J Steps 16–20.

| # | migration | pre-flight / verify (detail in §J) | STOP if | rollback |
|---|---|---|---|---|
| 16 | 041 (onboarding fields) | as a real user: `birth_month` null → 5 ok, 5 → 6 **42501**; `enrollment_term = 'winter'` **23514**; an app-shaped profile upsert ok | a month can be changed, or an ordinary save fails | §J Step 16 block (trigger first, then columns) |
| 17 | **042** (Family plan lock) | **pre-flight: count the families that will lock (§J Step 17 query) — they lose /family data at commit; that is the owner's decision.** Then, as real users: a free parent reads **0** of the player's `utr_entries` and a budget insert is **42501**; a Family-tier family (parent-paid AND player-paid) reads everything; `family_members()` still returns the roster for a free family | a free member reads another member's rows, or a paid family cannot | §J Step 17 block (policies, then functions) |
| 18 | **043** (parent email verification) | **dashboard first: add `<site>/auth/verified` to Auth redirect URLs.** As real users: an unverified parent's approve / consent / join → **42501 `verify_email_required`**; a player's approve unaffected; client `update ... email_verified_at` / `email_verify_requested_at` → **42501**; `request_email_verification()` → `allowed`, then `mark_email_verified()` with an `otp` amr OLDER than the request → **false**; `trigger seeded_note_auth_email_change` exists on `auth.users` | a player is refused, a client can set any of the four columns, an amr older than the request verifies, or the `auth.users` trigger did not create | §J Step 18 block (restore RPCs + trigger, then drop the auth.users trigger, the two new functions, the table and the columns) |
| 19 | 044 (roster respects the Family plan; needs 042) | as real users: a free family's parent gets the roster's names/roles/status but **NULL** `current_utr`, `grade`, `graduation_year`, `target_school_slugs`, `gender` for the player; a Family-tier family (parent-paid AND player-paid) gets them; a pending joiner still gets 0 rows; `family_members()` grants = authenticated/postgres/service_role only | a free member sees another member's stats, a paid family loses them, or the row count changes | §J Step 19 block (restore 038's body; before 042's rollback) |
| 20 | **045** (one Family plan = one family; 4 players / 2 parents; needs 042 + 043) | **pre-flight (read-only): every Family-tier payer's home family is the family they pay for, and no family is over either cap** (§J Step 20 query; 2026-11-19: 2 payers, both at home, 0 over). Then as real users: a payer approved into a SECOND family does not unlock it (that family's parent: `my_family_has_tier('family')` false, 0 of the player's `utr_entries`); the payer's home family stays unlocked; the 5th player's `join_family` → `family_full`; the 3rd parent's → `family_full`; approving either → **P0001 `family_full_<role>`**; clients calling `home_family_code` / `family_member_count` / `family_member_cap` → **42501** | a paid family locks, a second family unlocks, a 5th player or 3rd parent gets in, or a client can call the helpers | §J Step 20 block (restore 026/042/043 bodies, then drop the three helpers; before 044's rollback) |

---

## 4. Code: merge the PR (5 min + deploy)

`main` and `v1`: `main` was merged into `v1` (`0cea97e`) and
`middleware.ts` deleted on `v1` in the commit after it, so the merge removes
the maintenance page. **Re-dry-run the merge first if anything has landed on
`main`** (the overnight pass did this in a throwaway worktree — see the
report). Merge the PR (branch protection: PR + green `verify`).

## 5. Wait for Vercel production READY, then prove it is not still 503

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://seededtennis.com/
```

**Must be 200.** READY in the dashboard is not proof — the plain merge
once kept the 503 page and still went READY (§J Step 15).

**Code rollback:** Vercel → Deployments → previous production deployment →
Promote to Production (instant). Database changes do not roll back with
it; under the OLD code you must also run 024's rollback (old code writes
outreach at Family tier) and leave 028/034 in place (§J Step 15).

## 6. Live checks (20 min) — see the handoff list in `docs/FINAL_PASS_REPORT.md`

Public routes 200, headers, robots/sitemap, persona-(a)-shaped fit report
consistent, a signup confirmation email arrives (Google Workspace SMTP,
support@seededtennis.com, 80/hour), Whop test webhook → 200, reconcile the
paid bullis.org membership and confirm `profiles.subscription_tier`, the
$0 promo-code purchase, and a parent's view is read-only.
