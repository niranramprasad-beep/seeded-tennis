# Staging personas

**Staging only:** Supabase `gnlcpnsweqbtwpaqhqqg`. Never production.
Every account here is fake (`fake-*@example.com`) and **none has a usable
password**: `encrypted_password` is a random non-bcrypt string, so
`signInWithPassword` fails for all of them. To act as one, use the SQL
editor with `set local role authenticated` plus
`select set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true);`
inside a transaction you roll back. Remember that `postgres` (the editor's
default role) bypasses RLS, so a count taken without the role switch proves
nothing.

## PR B set (seeded 2026-11-18 for migrations 041–043)

ids are `00000000-0000-0000-0000-0000000b0NNN`, shown as the last four.

| family | id | email | role | tier | family link | email verified | data |
|---|---|---|---|---|---|---|---|
| **FAKEFAM-PB1** — FREE family | b0101 | fake-pb1-player@example.com | player (holder) | free | own profile code | no | UTR 7.60 → 8.05 → 8.40 (3 entries), 1 match, birth 4/2009, `fall_after_grad` |
| | b0102 | fake-pb1-parent@example.com | parent | free | approved link | **no** | 1 budget (4000), 2 expenses, 1 note to the player |
| | b0103 | fake-pb1-pending-parent@example.com | parent | free | **pending** link | **no** | — (the "approve a pending parent" case) |
| **FAKEFAM-PB2** — Family, **parent pays** | b0201 | fake-pb2-parent@example.com | parent (holder) | **family** | own profile code | **yes** | 1 budget (6500), 2 expenses, 1 note |
| | b0202 | fake-pb2-player@example.com | player | free | approved link | no | UTR 8.30 → 8.80 → 9.10, 1 match, birth 9/2008, `spring_after_grad` |
| **FAKEFAM-PB3** — Family, **player pays** | b0301 | fake-pb3-player@example.com | player (holder) | **family** | own profile code | no | UTR 9.40 → 9.90 → 10.20, birth 1/2009, `not_sure` |
| | b0302 | fake-pb3-parent@example.com | parent | free | approved link | **no** | 1 budget (5200), 2 expenses, 1 note |
| **FAKEFAM-PB4** — under-13 + unverified parent | b0401 | fake-pb4-parent@example.com | parent (holder) | free | own profile code | **no** | — |
| | b0402 | fake-pb4-minor@example.com | player, born 6/2015 | free | **pending** link | no | `consent_status = 'pending'`; no UTR |
| **FAKEFAM-PB5** — solo, no UTR | b0501 | fake-pb5-noutr@example.com | player (holder) | free | own profile code | no | `current_utr` NULL, **no** `utr_entries`, not onboarded, birth 11/2010 |

What each one is for:

- **PB1** — the lock. The parent sees the roster (3) but none of the
  player's rows, no budget, only the note they wrote themselves; a budget or
  note insert is refused 42501. The pending parent is what the player
  approves to show "a player approving is never asked to verify".
- **PB2 / PB3** — unlocked from either side. Both parents read the player's
  UTR history and the budget, and can add expenses and notes.
- **PB4** — the parent must verify before approving the child (which also
  records consent). `approve_family_join('…0b0402')` as b0401 →
  `42501 verify_email_required` until `mark_email_verified()` runs in a
  session whose `amr` says `otp`/`magiclink`.
- **PB5** — every "Not tracked" / no-UTR state.

Family-tier changes are made as `postgres`
(`update profiles set subscription_tier = … where id = …`), exactly as the
Whop sync's service role does. Do that inside a rolled-back transaction
unless you mean to change the persona for everyone.

## Older sets (still present, not changed by PR B)

| family | accounts | notes |
|---|---|---|
| FAKEFAM-A1 | fake-a-holder (parent, **family** tier), fake-a-player, fake-a-sibling, fake-a-parent2, fake-stranger-joiner (approved), fake-attacker and fake-public-solo (pending) | production-shaped: profiles carry the code AND have link rows. Unlocked by the holder's tier. |
| FAKEFAM-P1 | fake-persona-f (parent, **family** tier), fake-persona-a, fake-persona-g (under-13, consent pending) | the a–j persona set from the overnight pass |
| FAKEFAM-B2, FAKEFAM-C3, FAKEFAM-NEW | single-member families | |
| (none) | fake-persona-b…e, fake-paid-solo (player tier), fake-minor (pending), fake-postdob, fake-ratelimit-probe | |

**Flag:** `fake-sweep-player@example.com` (id `b44ccc7c-…`, family tier, no
family) has a **bcrypt** `encrypted_password`, i.e. a usable password,
contrary to the rule above. It was not created by PR B. Scramble it if
nobody is using it.

## Re-seeding the PR B set

Idempotent (deletes its own ids and codes first). Run as `postgres` on
staging only.

```sql
begin;
delete from auth.users where id in (
  '00000000-0000-0000-0000-0000000b0101','00000000-0000-0000-0000-0000000b0102','00000000-0000-0000-0000-0000000b0103',
  '00000000-0000-0000-0000-0000000b0201','00000000-0000-0000-0000-0000000b0202',
  '00000000-0000-0000-0000-0000000b0301','00000000-0000-0000-0000-0000000b0302',
  '00000000-0000-0000-0000-0000000b0401','00000000-0000-0000-0000-0000000b0402',
  '00000000-0000-0000-0000-0000000b0501');
delete from public.budget_expenses where family_code like 'FAKEFAM-PB_';
delete from public.season_budgets  where family_code like 'FAKEFAM-PB_';
delete from public.family_codes    where code like 'FAKEFAM-PB_';
delete from public.families        where code like 'FAKEFAM-PB_';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email,
       'scrambled-' || md5(random()::text || clock_timestamp()::text), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from (values
  ('00000000-0000-0000-0000-0000000b0101','fake-pb1-player@example.com'),
  ('00000000-0000-0000-0000-0000000b0102','fake-pb1-parent@example.com'),
  ('00000000-0000-0000-0000-0000000b0103','fake-pb1-pending-parent@example.com'),
  ('00000000-0000-0000-0000-0000000b0201','fake-pb2-parent@example.com'),
  ('00000000-0000-0000-0000-0000000b0202','fake-pb2-player@example.com'),
  ('00000000-0000-0000-0000-0000000b0301','fake-pb3-player@example.com'),
  ('00000000-0000-0000-0000-0000000b0302','fake-pb3-parent@example.com'),
  ('00000000-0000-0000-0000-0000000b0401','fake-pb4-parent@example.com'),
  ('00000000-0000-0000-0000-0000000b0402','fake-pb4-minor@example.com'),
  ('00000000-0000-0000-0000-0000000b0501','fake-pb5-noutr@example.com')
) v(id, email);

insert into public.families (code, name) values
  ('FAKEFAM-PB1','Fake PB1 family (free)'),
  ('FAKEFAM-PB2','Fake PB2 family (parent pays Family)'),
  ('FAKEFAM-PB3','Fake PB3 family (player pays Family)'),
  ('FAKEFAM-PB4','Fake PB4 family (under-13 pending + unverified parent)'),
  ('FAKEFAM-PB5','Fake PB5 (solo player, no UTR)');

insert into public.profiles (id, name, email, country, gender, role, family_code, current_utr, grade,
  graduation_year, birth_year, birth_month, enrollment_term, subscription_tier, consent_status, onboarded,
  email_verified_at, email_verified_for)
values
  ('00000000-0000-0000-0000-0000000b0101','Fake Pb1 Player','fake-pb1-player@example.com','US','female','player','FAKEFAM-PB1',8.40,11,2028,2009,4,'fall_after_grad','free','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0102','Fake Pb1 Parent','fake-pb1-parent@example.com','US','female','parent',null,null,null,null,1978,null,null,'free','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0103','Fake Pb1 Pendingparent','fake-pb1-pending-parent@example.com','US','male','parent',null,null,null,null,1977,null,null,'free','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0201','Fake Pb2 Parent','fake-pb2-parent@example.com','US','male','parent','FAKEFAM-PB2',null,null,null,1975,null,null,'family','not_required',true,now(),'fake-pb2-parent@example.com'),
  ('00000000-0000-0000-0000-0000000b0202','Fake Pb2 Player','fake-pb2-player@example.com','US','male','player',null,9.10,12,2027,2008,9,'spring_after_grad','free','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0301','Fake Pb3 Player','fake-pb3-player@example.com','US','female','player','FAKEFAM-PB3',10.20,11,2028,2009,1,'not_sure','family','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0302','Fake Pb3 Parent','fake-pb3-parent@example.com','US','female','parent',null,null,null,null,1980,null,null,'free','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0401','Fake Pb4 Parent','fake-pb4-parent@example.com','US','female','parent','FAKEFAM-PB4',null,null,null,1983,null,null,'free','not_required',true,null,null),
  ('00000000-0000-0000-0000-0000000b0402','Fake Pb4 Minor','fake-pb4-minor@example.com','US','male','player',null,null,7,2033,2015,6,null,'free','pending',false,null,null),
  ('00000000-0000-0000-0000-0000000b0501','Fake Pb5 Noutr','fake-pb5-noutr@example.com','US','male','player','FAKEFAM-PB5',null,10,2029,2010,11,null,'free','not_required',false,null,null);

insert into public.family_codes (code, player_id) values
  ('FAKEFAM-PB1','00000000-0000-0000-0000-0000000b0101'),
  ('FAKEFAM-PB2','00000000-0000-0000-0000-0000000b0201'),
  ('FAKEFAM-PB3','00000000-0000-0000-0000-0000000b0301'),
  ('FAKEFAM-PB4','00000000-0000-0000-0000-0000000b0401'),
  ('FAKEFAM-PB5','00000000-0000-0000-0000-0000000b0501');

insert into public.parent_accounts (user_id, family_code, status, approved_at, approved_by) values
  ('00000000-0000-0000-0000-0000000b0102','FAKEFAM-PB1','approved', now(), '00000000-0000-0000-0000-0000000b0101'),
  ('00000000-0000-0000-0000-0000000b0103','FAKEFAM-PB1','pending',  null,  null),
  ('00000000-0000-0000-0000-0000000b0202','FAKEFAM-PB2','approved', now(), '00000000-0000-0000-0000-0000000b0201'),
  ('00000000-0000-0000-0000-0000000b0302','FAKEFAM-PB3','approved', now(), '00000000-0000-0000-0000-0000000b0301'),
  ('00000000-0000-0000-0000-0000000b0402','FAKEFAM-PB4','pending',  null,  null);

insert into public.utr_entries (user_id, utr, recorded_at, note) values
  ('00000000-0000-0000-0000-0000000b0101', 7.60, date '2026-02-14', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0101', 8.05, date '2026-06-01', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0101', 8.40, date '2026-10-20', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0202', 8.30, date '2026-01-10', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0202', 8.80, date '2026-05-15', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0202', 9.10, date '2026-09-30', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0301', 9.40, date '2026-03-01', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0301', 9.90, date '2026-07-04', 'fake seed'),
  ('00000000-0000-0000-0000-0000000b0301', 10.20, date '2026-11-01', 'fake seed');

insert into public.season_budgets (family_code, season_label, total_budget, updated_by) values
  ('FAKEFAM-PB1','2026-27 season', 4000, '00000000-0000-0000-0000-0000000b0102'),
  ('FAKEFAM-PB2','2026-27 season', 6500, '00000000-0000-0000-0000-0000000b0201'),
  ('FAKEFAM-PB3','2026-27 season', 5200, '00000000-0000-0000-0000-0000000b0302');

insert into public.budget_expenses (family_code, created_by, category, label, amount, expense_date) values
  ('FAKEFAM-PB1','00000000-0000-0000-0000-0000000b0102','entries','Fake L5 entry fee', 85, date '2026-10-04'),
  ('FAKEFAM-PB1','00000000-0000-0000-0000-0000000b0102','travel','Fake gas + parking', 60, date '2026-10-04'),
  ('FAKEFAM-PB2','00000000-0000-0000-0000-0000000b0201','camps','Fake winter camp deposit', 450, date '2026-11-02'),
  ('FAKEFAM-PB2','00000000-0000-0000-0000-0000000b0201','entries','Fake L4 entry fee', 95, date '2026-09-12'),
  ('FAKEFAM-PB3','00000000-0000-0000-0000-0000000b0302','travel','Fake hotel, 1 night', 140, date '2026-10-18'),
  ('FAKEFAM-PB3','00000000-0000-0000-0000-0000000b0302','entries','Fake L4 entry fee', 95, date '2026-10-18');

insert into public.encouragement_notes (family_code, parent_id, player_id, body) values
  ('FAKEFAM-PB1','00000000-0000-0000-0000-0000000b0102','00000000-0000-0000-0000-0000000b0101','Fake note: proud of the effort this weekend.'),
  ('FAKEFAM-PB2','00000000-0000-0000-0000-0000000b0201','00000000-0000-0000-0000-0000000b0202','Fake note: great serve practice.'),
  ('FAKEFAM-PB3','00000000-0000-0000-0000-0000000b0302','00000000-0000-0000-0000-0000000b0301','Fake note: good luck Saturday.');

insert into public.matches (user_id, family_code, match_date, opponent, opponent_utr, tournament_name, result, score) values
  ('00000000-0000-0000-0000-0000000b0101','FAKEFAM-PB1', date '2026-10-19','Fake Opponent', 8.1,'Fake Fall Open','win','6-4 6-3'),
  ('00000000-0000-0000-0000-0000000b0202','FAKEFAM-PB2', date '2026-09-13','Fake Opponent', 9.3,'Fake Labor Day L4','loss','4-6 6-7');
commit;
```
