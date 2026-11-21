# Independent security review — `v1`

**Reviewer:** independent (did not write this code)
**Date:** 2026-11-14 / 2026-11-15
**Scope:** `git diff main...v1` — migrations 022–031, Whop billing, auth/OAuth, family RPCs,
deletion/export, rate limits, security headers.
**Target:** staging `gnlcpnsweqbtwpaqhqqg` only. Production `tfpjssmhiptbwigarxpx` was never
read from or written to during this review.

Method: every finding below was reproduced with real SQL against the live staging schema before
being written down. Code comments were treated as claims to verify, not as evidence. Anything I
suspected but could not reproduce is in **Hypotheses I could not reproduce** with the reason.

---

## Findings

| # | Severity | Issue | Proof | Fix | Retest |
|---|----------|-------|-------|-----|--------|
| 1 | **Critical** | **Unapproved family takeover and minor-data exposure via the `profiles` INSERT path.** 022's trigger guards `family_code` on UPDATE only; its INSERT branch returns `new` unchanged, so a client sets `family_code` freely on first insert. There is no trigger on `auth.users`, so every freshly signed-up account has that INSERT available. `is_family_member()`/`is_parent_member()` read `profiles.family_code` directly, so one statement grants full, instant, unapproved family membership — bypassing 023/026 entirely. | see §1 below | migration `032_block_family_code_on_profile_insert.sql` — a `family_code` on INSERT is allowed only when no profile and no `parent_accounts` row already holds it (create = new code; join = taken code). Lookup goes through a new `SECURITY DEFINER` helper `family_code_is_taken()`, because 022's trigger is `SECURITY INVOKER` and an inline `exists(...)` would itself be filtered by RLS and silently return false. | **Pass** — attack now raises `42501`; create path, honest join path and ordinary profile updates all still work. see §1 |
| 2 | Medium | **The under-13 parental-consent gate is skipped by omitting `birth_year`.** `consent_required_for_birth_year(null)` is `false`, so a profile inserted with no birth year gets `consent_status='not_required'` and `account_active()=true` — a fully active account that never passed the age check. 030's 21 restrictive policies all hang off `account_active()`, so none of them engage. The age check is enforced only by the client routing an account with no birth year to `/auth/complete`. | see §2 | **Not fixed by me** — this is a product/legal decision, not a bug I should settle. P0-8 is open and flagged for legal/adult review. Recommended: make `birth_year` required at the DB layer for new rows (existing nulls grandfathered), so an account must make an explicit age claim rather than silently skipping one. | n/a |
| 3 | Low | **Seven API routes return raw Postgres error text to the client.** `/api/profile`, `/api/matches`, `/api/utr-entries`, `/api/outreach`, `/api/family/budget`, `/api/family/budget/expenses`, `/api/training/planner`, `/api/training/templates` all end with `err instanceof Error ? err.message : …`. `writeCurrentPlayerProfile` throws `new Error(error.message)` straight from PostgREST, so constraint and column names reach the browser. `/api/account/export` and `/api/account/deletion` deliberately do *not* do this ("Deliberately generic (S-10)"), so the control exists and these routes are the exception. | Code-verified, not runtime-reproduced — stated as such. Grep in §3. | Return a fixed sentence and `console.error` the detail server-side, matching the export/deletion routes. | n/a |
| 4 | Low | **Rate limiting is advisory.** `consume_rate_limit` is only called by the Next API routes, but PostgREST is directly reachable with the same bearer token, so every table write can skip it. 024's own comment already concedes this for `profiles` ("a user can PATCH their own profile row directly through PostgREST and never touch /api/profile"); it is true of every table, not just that one. | During this review I wrote to `profiles`, `season_budgets` and `encouragement_notes` as role `authenticated` without ever calling `consume_rate_limit`. | Not a code bug — inherent to the anon-key + RLS architecture. The honest fix is Postgres-side: a per-user insert-rate trigger on the hot tables, or accept it and say so in SECURITY_CHECKLIST rather than describing the buckets as covering "every write route". | n/a |
| 5 | Low | **`findProfileIdByEmail` uses the Whop-supplied email as an `ilike` *pattern*.** `lib/whop-sync.ts` does `.ilike("email", normalized)`, so `%` and `_` in a buyer's Whop email act as wildcards. A membership bought under `%@gmail.com` resolves to a profile the buyer does not own whenever exactly one profile matches, attaching a paid tier to a stranger's account. Not privilege escalation (the attacker gives access away rather than taking it), but it is the one place an email decides who gets a paid tier. | Code-verified. The `data.length !== 1` guard limits but does not remove it: a targeted pattern matches exactly one row. | Use `.eq("email", normalized)` against a normalized column. Exact match is what the surrounding comment already says it wants ("it must match exactly one profile"). | n/a |
| 6 | Info | **`families` INSERT is open to any authenticated user** — `families insertable` has `with_check ((select auth.role()) = 'authenticated')` and no ownership condition, so anyone can insert arbitrary rows. Only the `UNIQUE (code)` constraint limits the damage. No access is gained (membership comes from `profiles.family_code` / `parent_accounts`, not from this table), so this is table pollution, not a breach. Worth knowing that this unique constraint is doing real security work: it is what stops the `user_metadata.family_code` + `family_mode:"create"` path in `lib/auth.ts:704` from becoming a second route to finding #1. | Policy read from `pg_policies`; the metadata path aborts at `familyInsertError.code === '23505'` before the profile insert. | Scope the policy to the inserting user, or move family creation into an RPC. | n/a |
| 7 | Info | **Family trust model is flatter than the docs imply.** `is_parent_member()` returns true for *any* approved `parent_accounts` row regardless of `profiles.role`, so an approved joiner gets parent-level writes on `season_budgets`/`budget_expenses` whether or not they are a parent. `remove_family_member()` lets any approved member remove any other member's link. `approve_family_join()` also grants COPPA consent as a side effect when the approver's self-declared `role='parent'`. All three are defensible for a shared family account, but "Parents are read-only except the season budget" describes a narrower model than the policies implement. | Function bodies read from `pg_proc`. | Product decision. Note it in SECURITY_CHECKLIST so the next reviewer doesn't read it as a bug. | n/a |

---

### §1 — Finding 1, proof and retest

Fixture: a brand-new auth user with **no profile row** — exactly the post-signup state.

```sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-0000000000ff',
        'authenticated','authenticated','attacker-insert@test.example','x',
        now(),now(),now(),'{"provider":"email","providers":["email"]}','{}');
```

The victim is the existing staging fixture `player@test.example` (family `TESTFAMILYA`), given
realistic minor data for the test: `birth_year=2011, gpa=3.74, current_utr=6.2, grade=9,
home_area='Plano, TX'`.

**Baseline** — as that user, before any profile row exists:

```
BASELINE profiles readable | n=0 | who=(none)
BASELINE matches visible   | 0
```

**Attack** — the only difference from the real signup path is that `family_code` and `role` are
included in the insert:

```sql
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}';

insert into profiles (id, name, email, country, role, family_code, onboarded)
values ('00000000-0000-0000-0000-0000000000ff','Mal Attacker',
        'attacker-insert@test.example','US','parent','TESTFAMILYA',true);
```

Result — the insert succeeds and membership is immediate:

```
profiles_readable | 2
is_family_member  | true
is_parent_member  | true
minors_exposed    | player@test.example utr=6.20 gpa=3.74 by=2011
```

Full blast radius, same transaction:

```
utr (minor's UTR history)   | 1
families                    | 1
parent_accts                | 2
fam_rpc_rows                | 4
rpc_leak | player@test.example consent=not_required
         | attacker-insert@test.example consent=not_required
         | parent-approved@test.example consent=not_required
         | sibling13@test.example consent=granted      <-- under-13 sibling
budget_written              | 1      <-- parent-only write on season_budgets
note_written_to_minor       | 1      <-- encouragement_note addressed to the child
```

So one unprivileged INSERT yields: the minor's name, email, birth year, GPA, UTR, home area and
UTR history; every family member's email and consent status including an under-13's;
`family_members()` listing the attacker as `status='approved', is_creator=true`; parent-level
write on the family budget; and the ability to write text addressed to the child inside the app.
The 023/026 pending-approval flow is not involved at any point.

`lib/auth.ts`'s join branch carries this comment:

> No `family_code` on the profile. […] Writing it here would both be rejected by 022 on the
> update path and silently grant the access the approval step exists to withhold.

The first half is true. The second half was the only thing holding the door shut, and it was
client-side politeness, not a control.

**Prerequisite and why it still matters.** The attacker must know the 12-character family code.
That is not brute-forceable — but it is the value the product deliberately hands to prospective
joiners so they can request access. The people who have a code are exactly the population the
PENDING-approval flow exists to hold at the door, and this let any of them walk straight past it.

**Retest after applying 032 to staging:**

| Test | Expected | Actual |
|---|---|---|
| 1. The attack above, unchanged | blocked | `ERROR: 42501: Use the join code to request access to an existing family; it cannot be set on a profile directly.` |
| 2. Legitimate create path — `families` insert + profile insert with a brand-new code `NEWFAMCODE99` | allowed, own family only | `my_code=NEWFAMCODE99, own_family_ok=true, victim_family=false, profiles_visible=1` |
| 3. Honest join path — profile insert with no `family_code`, then `join_family('TESTFAMILYA')` | allowed, lands PENDING, reads nothing | `join_result={"status":"pending","already":false}, member_yet=false, profiles_visible=1, utr_visible=0` |
| 4. No regression — existing user's ordinary profile UPDATE (`name`, `gpa`, `target_school_slugs`) | allowed | succeeded, `family_code` unchanged |

`npx vitest run` after the change: **43 files, 568 tests, all passing.**

### §2 — Finding 2, proof

```sql
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}';

insert into profiles (id, name, email, country, role, onboarded)
values ('00000000-0000-0000-0000-0000000000ff','Twelve YearOld',
        'attacker-insert@test.example','US','player',true);
```

```
birth_year=null  consent_status=not_required  acct_active=true
consent_required_for_birth_year(null)=false   consent_required_for_birth_year(2016)=true
```

Declaring `birth_year=2016` correctly yields `consent_status='pending'` and
`account_active()=false`, so the gate works when a birth year is supplied. It simply is never
reached when one is not.

### §3 — Finding 3, proof

```
$ grep -n "err.message" app/api/*/route.ts app/api/*/*/route.ts
app/api/profile/route.ts:              err instanceof Error ? err.message : "Could not save your profile. Try again."
app/api/matches/route.ts:              err instanceof Error ? err.message : "Could not save that match. Try again."
app/api/utr-entries/route.ts:          err instanceof Error ? err.message : "Could not save your UTR entry. Try again."
app/api/outreach/route.ts:             err instanceof Error ? err.message : "Could not save that. Try again."
app/api/family/budget/route.ts:        err instanceof Error ? err.message : "Could not save the budget. Try again."
app/api/family/budget/expenses/route.ts: err instanceof Error ? err.message : "Could not save the expense. Try again."
app/api/training/planner/route.ts:     err instanceof Error ? err.message : "Could not save your training plan. Try again."
app/api/training/templates/route.ts:   err instanceof Error ? err.message : "Could not save that template. Try again."
```

`lib/auth.ts:writeCurrentPlayerProfile` → `throw new Error(error.message)` where `error` is the
PostgREST error, so the thrown message is Postgres's own text.

---

## Checked and found clean

Each of these was probed, not assumed. Evidence included so the next reviewer doesn't redo it.

**Anonymous access — clean.** As role `anon`: `profiles=0, families=0, family_codes=0,
matches=0, utr_entries=0, parent_accounts=0`. The broad column-level grants to `anon` visible in
`information_schema.column_privileges` are inert because RLS has no permissive `anon` policy on
any table. Noisy, not exploitable.

**Signed-in stranger — clean (after finding 1).** A user with a profile but no family link reads
0 rows from every family table. Verified in §1 retest 3.

**`profiles` INSERT privilege escalation — clean.** Attempting to set every privileged column at
once on insert:

```
sent:   subscription_tier='family', whop_membership_id='mem_fake', stripe_customer_id='cus_fake',
        consent_status='not_required', consent_granted_at=now(), birth_year=2016
landed: subscription_tier=free, whop_membership_id=null, stripe_customer_id=null,
        consent_status=pending, consent_granted_at=null, birth_year=2016
        has_tier('family')=false, account_active()=false
```

022's INSERT branch correctly forces all of them. Tier escalation and consent escalation via
INSERT both fail. `role` is accepted on insert but constrained by
`profiles_role_check CHECK (role = ANY (ARRAY['player','parent']))`, and with 032 in place a
self-declared `role='parent'` only has effect inside a family you legitimately created.

**`profiles` UPDATE lockdown — clean.** `subscription_tier`, `whop_membership_id`, `stripe_*`,
`role`, `family_code` and a non-null `birth_year` all raise `42501` on change;
`consent_*` is force-reverted to the old value. Verified by reading the live trigger body and by
retest 4.

**Tier gating — clean, and the live policy set matches 024's intent.** `coach_outreach` carries
both 019's per-command policies (`has_tier('family')`) and 024's `ALL` policy
(`has_tier('player')`). Permissive policies OR, so the effective gate is `player` — which is
exactly what 024 set out to do. The leftover family-tier policies are redundant, not a bypass.
Confirmed negatively: a free-tier user's outreach insert fails with
`42501: new row violates row-level security policy for table "coach_outreach"`.

**SECURITY DEFINER functions — clean.** All 18 have `SET search_path` (17 to `public`,
`rls_auto_enable` to `pg_catalog`). None is executable by `anon`.
`current_family_code`, `generate_family_code`, `set_updated_at`, `rls_auto_enable`,
`enforce_free_tier_target_limit` and `protect_privileged_profile_columns` are executable by
nobody. The two triggers that must see the caller's identity
(`protect_privileged_profile_columns`, `enforce_free_tier_target_limit`) are correctly
`SECURITY INVOKER`.

**Parameter-trusting RPCs — clean (no IDOR).**
- `approve_family_join(uuid)` — requires `my_family_code()` non-null *and*
  `is_family_member()`. A pending joiner has neither (their `profiles.family_code` is null and
  their `parent_accounts.status` is `pending`), so **a pending joiner cannot self-approve**. The
  UPDATE is scoped `where user_id = p_parent_user_id and family_code = v_code and status='pending'`.
- `grant_parent_consent(uuid)` — rejects self (`p_user_id = v_user`), rejects a caller whose own
  consent is pending, requires caller `role='parent'`, and resolves the target's family code
  from the *target's* row before checking `is_family_member()` on the *caller*. A minor cannot
  self-consent.
- `remove_family_member(uuid)` — rejects self, scoped to the caller's own family code.
- `delete_my_account()` — takes no user id at all; can only delete its own caller. It deletes
  `auth.users`, which cascades the profile, so it cannot be used to re-open the finding-1 INSERT
  window on a surviving account.
- `join_family(text)` — rate-limited to 5/hour in-function, records every attempt, and always
  inserts `status='pending'`.

**RLS enabled with no policies — clean (fail closed).** `badges`, `family_join_attempts`,
`friendships`, `rate_limit_events`. Enabled with zero policies denies all access to
`anon`/`authenticated`; the only writer is `consume_rate_limit`, which is `SECURITY DEFINER` and
runs as owner. Correct posture, and these are the four the advisor reports.

**`parent_accounts` writes — clean.** Table-level INSERT/UPDATE is granted to `authenticated`,
but the table has no permissive INSERT/UPDATE/DELETE policy — only the restrictive
`account_active_required` and `parent_accounts_read_family` (SELECT). So all direct client writes
are denied and status changes can only happen through the RPCs. The grants are redundant; RLS is
the control and it holds.

**Whop webhook spoofing and replay — clean.** `unwrapWebhook` is called on `await req.text()`
(unparsed bytes, correct for signature verification) and the route returns 500 if
`WHOP_WEBHOOK_SECRET` is unset — fails closed, no unsigned path. Replay is neutralised by
`applyMembershipToProfile` being idempotent: a replayed activation for the membership already on
record returns `already-current`, a stale activation for a superseded membership is refused by
`would-downgrade-active-membership`, and a cancellation's UPDATE is scoped
`.eq("whop_membership_id", facts.membershipId)` so it cannot revoke a *different* membership.
An unknown plan grants nothing and revokes nothing.

**`/api/whop/sync` self-granting — clean.** A caller cannot name a tier. The route matches
memberships on `metadata.supabase_user_id === ctx.user.id`, and that metadata is written only by
`/api/whop/checkout` from `ctx.user.id` server-side — never from a request body. The tier is then
derived from the plan id via `tierForPlanId`. The plan loop breaks on the first
access-granting match in `allConfiguredPlanIds` order (player before family), so a user holding
two memberships could be under-granted, never over-granted. Unreachable Whop returns 502
`whop-unreachable` rather than guessing.

**API route authorization — clean, no IDOR.** All eleven routes resolve identity from the bearer
token via `getRequestScopedSupabase`, which builds a fresh per-request client (not the browser
singleton) and forwards the token so `auth.uid()` resolves inside RLS. Every route uses
`ctx.user.id` / `ctx.user.email` and derives `familyCode` server-side via
`getProfileRoleAndFamily`. No route accepts a `user_id`, `email`, `family_code` or `tier` from
the body. `/api/profile` reads the tier from the caller's own row with an explicit
"never trust a tier sent in the body" comment, and that comment is accurate.

**Open redirect on the OAuth callback — clean.** `safeRedirectPath` rejects non-`/` values,
`//host`, `/\host`, any string containing a backslash, and control characters
`\u0000-\u001f\u007f`. The result is passed to `router.replace`, which cannot leave the origin
anyway. Provider errors are mapped to readable text rather than echoed.

**OAuth `user_metadata` path — clean, but load-bearing on a constraint.**
`lib/auth.ts:326` reads `metadata.family_code` and `metadata.family_mode` from
`user_metadata`, which a client *can* set. Setting `family_code=<victim code>` with
`family_mode='create'` would reach the create branch — but that branch inserts into `families`
first and aborts on `23505` before the profile insert, because the code already exists. So the
`families` UNIQUE constraint is what blocks this variant. Worth recording because it is not
obvious from reading either file alone.

**Secret leakage — clean.** `SUPABASE_SERVICE_ROLE_KEY`, `WHOP_API_KEY`,
`WHOP_WEBHOOK_SECRET` and `GA4_MEASUREMENT_PROTOCOL_API_SECRET` are all read without a
`NEXT_PUBLIC_` prefix, so Next does not inline them into the client bundle. Every importer of
`lib/whop.ts` and `lib/ga4-server.ts` is a route handler; none is a `"use client"` module. The
webhook's `log()` deliberately omits the buyer's email. `/api/account/export` sets
`cache-control: no-store, private`. No env values were read during this review.

**Security headers / CSP — adequate, with one honest gap.** `frame-ancestors 'none'` +
`X-Frame-Options: DENY`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
HSTS 2y with subdomains (no `preload` — correctly left as an owner decision),
`nosniff`, `strict-origin-when-cross-origin`, COOP `same-origin`, and a Permissions-Policy
denying camera/mic/geolocation/payment. `script-src` includes `'unsafe-inline'`, so the CSP
blocks off-origin script hosts but not injected inline script. The config says exactly that in a
comment and the checklist records it as partial rather than done — the self-assessment is
accurate, so I am not restating it as a finding.

---

## Hypotheses I could not reproduce

**"A pending joiner can approve themselves."** No. `approve_family_join` gates on
`my_family_code()`, which `coalesce`s `profiles.family_code` with a `parent_accounts` row whose
`status = 'approved'`. A pending joiner has null for the first and no match for the second, so
`v_code` is null and the function raises `22023: You are not in a family.` Verified by reading
the live function body and by retest 3, where the joiner's `is_family_member` stayed `false`
after `join_family` returned `pending`.

**"`is_family_member()` is satisfied by a `pending` row."** No — the `parent_accounts` branch
requires `pa.status = 'approved'` explicitly. The weakness was never in this function; it was in
the *other* branch, `profiles.family_code`, being client-settable on INSERT (finding 1).

**"Inserting a `families` row for a code you don't own grants access."** No. Membership is read
from `profiles.family_code` and `parent_accounts`, never from `families`. Inserting a `families`
row with an arbitrary new code only lets `join_family` accept that code and create a *pending*
row in a family with no other members. And a *victim's* code cannot be inserted at all —
`families_code_key` is UNIQUE.

**"`family_codes` can be hijacked to fake membership."** No. `family_codes` has
`PRIMARY KEY (code)`, so an attacker cannot insert a row for a code the real family already
holds, and nothing in the policy set or any RPC derives membership from `family_codes` — it is
read for display only.

**"A free user can write coach outreach because 024's policy loosened the tier."** No. The
effective gate is `has_tier('player')`, which is false for free. Reproduced:
`42501: new row violates row-level security policy for table "coach_outreach"`.

**"`consume_rate_limit` can be made to grant a higher limit by passing a crafted bucket."** No.
The limits live in a `CASE` inside the function and an unrecognised bucket returns
`allowed=false, reason='unknown_bucket'` — fail closed. The app-side wrapper also fails closed
when the RPC errors. The weakness is coverage (finding 4), not the limiter itself.

**"The account export leaks other users' rows."** Not reproduced. `buildAccountExport` runs on
the request-scoped, RLS-respecting client with `ctx.user.id`; whatever it selects is already
filtered by the same policies I tested directly above. I did not find a path by which it returns
another account's data.

**"A stale/replayed Whop event can downgrade or cross-grant a tier."** Not reproduced — see the
idempotency and scoping analysis under "Checked and found clean". I did not send live webhooks
(that would need the production secret and a real Whop delivery), so this rests on code reading
plus the existing `lib/whop-sync.test.ts` coverage rather than a live request. Labelled as such.

---

## Advisors (staging, `type: security`, run at end of review)

| Lint | Level | Count | Status |
|---|---|---|---|
| `auth_leaked_password_protection` | WARN | 1 | Already documented |
| `rls_enabled_no_policy` | INFO | 4 | Already documented — `badges`, `family_join_attempts`, `friendships`, `rate_limit_events`. Fail-closed, verified above |
| `authenticated_security_definer_function_executable` | WARN | **18** (was 17) | Already documented; **count rose by one, and the new one is mine** — `family_code_is_taken(text)`, added by migration 032 |

**No new warning categories appeared.** The only delta against the three findings already in
`docs/SECURITY_CHECKLIST.md` is the SECURITY DEFINER count going 17 → 18, entirely accounted for
by `family_code_is_taken()`. That function is intentionally `SECURITY DEFINER` (it must see past
RLS for the 022 INSERT guard to work), intentionally executable by `authenticated` (the trigger
runs as the caller), and returns a boolean only — it discloses nothing the UNIQUE constraint on
`families.code` does not already expose. Update the checklist's count to 18 with that note.

---

## State left behind

- **Production: untouched.** No reads, no writes, no migrations.
- **Staging:** migration 032 applied and attack-tested. `profiles` is back to its original 5 rows;
  `season_budgets` and `encouragement_notes` are back to 0 — every attack transaction was rolled
  back. Two intentional leftovers, both clearly fake:
  - `auth.users` row `…00ff` / `attacker-insert@test.example`, with **no profile row**. Kept
    deliberately: it is the only fixture that reproduces the "signed up, no profile yet" state
    needed to regression-test 032. Delete it if you'd rather.
  - `player@test.example` now carries test minor data (`birth_year=2011, gpa=3.74,
    current_utr=6.2, grade=9, home_area='Plano, TX'`) added to make finding 1's impact measurable.
- **Repo:** one new file from me, `supabase/migrations/032_block_family_code_on_profile_insert.sql`.
  `npx vitest run` → 568/568 passing. **I committed nothing and pushed nothing** — but see the
  warning immediately below, because something else did.

### ⚠️ Migration 032 was committed and pushed by a concurrent session, not by me

While this review was running, another session committed five times to `v1` and pushed them.
`HEAD` moved from `9524eab` (where I started) to `7fa0db7`, and `origin/v1` now equals `HEAD`:

```
f3fcd6a Task 4: a privacy policy whose claims the build checks
3bc07ac Task 6: E2E on staging, and a correction to CLAUDE.md   <-- swept in my 032 file
585167f Task 8: morning launch checklist at the top of the overnight report
1106b08 Task 7: self-check, and the before-screenshots I was missing
7fa0db7 Add the design mockup spec to the repo
```

`git log --diff-filter=A` shows `032_block_family_code_on_profile_insert.sql` was added by
**`3bc07ac`**, a commit about end-to-end testing — almost certainly a `git add -A` that picked up
my then-untracked file. The file content in `HEAD` is byte-identical to what I wrote
(`git diff HEAD` on it is empty), so nothing was altered. I did not rewrite history to extract
it, because that would clobber a parallel session's pushed work.

**Why this matters, and what to do:**

1. A critical security migration is now on `origin/v1` under a commit message that says nothing
   about security. It is easy to miss in a merge review. Consider an explicit follow-up commit or
   a line in MASTER_ROADMAP so the deployment coupling is visible.
2. **032 carries the same coupling as 024: it must be applied to production BEFORE or in the same
   window as the `v1` → `main` merge.** It is now committed, so a merge will carry the file
   whether or not the migration has been run. The code half is fine without it (the honest client
   never sets `family_code` on insert) — but the hole stays open until the migration is applied.
3. Nothing else of mine is committed. `docs/SECURITY_REVIEW_INDEPENDENT.md` is untracked.

## What needs a decision from Niran

1. **Apply 032 to production.** It needs explicit, current-turn sign-off per CLAUDE.md. Note it
   is a pure tightening of an INSERT path — it cannot break an existing row, and the create/join/
   update paths are all verified unaffected. Production is in maintenance mode, so there is no
   live exposure right now, but **this must not merge to `main` without 032 applied**, for the
   same reason 024 carries a deployment-coupling banner.
2. **Finding 2 (birth_year)** is a legal/product call, not mine to make. It belongs with P0-8.
3. **Still outstanding from before this review:** the Whop, Gemini and Stripe credentials are
   pending revocation at the provider. Deleting the code did not revoke the keys.
