# Family access (as built, 2026-11-20)

Migrations 023, 026, 036, 037, 042, 043, 045, 046 and 050 — all on
production. Membership has two storage shapes: the account holder's
`profiles.family_code`, and each joiner's `parent_accounts` row (whose own
`profiles.family_code` stays NULL).

```mermaid
sequenceDiagram
  participant J as Joiner (parent or player)
  participant DB as Supabase (RPCs + RLS)
  participant M as Approved member
  Note over J,DB: A parent must first prove their email (043):<br/>request_email_verification() then mark_email_verified()
  J->>DB: rpc join_family(code)  (rate-limited, every attempt logged)
  DB-->>J: pending  (or family_full: max 4 players + 2 parents, 045)
  Note over J: Pending reads nothing of the family
  M->>DB: rpc approve_family_join(joiner)  (parent approver must be verified)
  DB-->>M: approved  (also records consent for an under-13 player)
  J->>DB: select own rows + rpc family_members()
  Note over DB: Other members' rows are readable only if the family<br/>has the Family plan (042/045). profiles: own row only (037).
  J->>DB: insert season_budgets / budget_expenses / encouragement_notes
  Note over DB: Allowed only if the caller's own role = 'parent'<br/>and approved member (033, 050) and Family plan (042)
  J->>DB: rpc leave_family()  (046; the account holder cannot leave)
```

`role`, `family_code`, `subscription_tier` and the email-verification
columns cannot be written by the client (022 trigger and successors);
`parent_accounts` and `families` are written only by these RPCs.

Known open gap: any approved member may approve a joiner, so a player can
approve a parent account they created themselves (`docs/TODO.md`, "Who may
approve a parent joiner").

The 2026-11-10 "today (insecure)" diagram — every family code readable, a
self-set `family_code` granting access — was fixed by 022/023; it remains
in this file's git history.
