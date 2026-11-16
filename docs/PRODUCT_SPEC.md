# Seeded — Product Spec (V1)

## One sentence
Seeded tells a junior tennis player which college teams they can
realistically make, using real roster data, and what to do this month to
close the gap — with a read-only view for parents.

## Users
- **Player (13–18)** — primary account.
- **Parent** — linked to a player with the player's approval; read-only except the season budget. Creates the account for players under 13.

## Core loop
Log UTR → see real bands against real rosters → pick targets → track
coach outreach → parent sees progress.

## V1 features and their honest status
| Feature | V1? | Status today | Gap |
|---|---|---|---|
| Signup / login / reset | Must | Works (email/password) | rate limits, leaked-password check |
| Onboarding + under-13 routing | Must | Client-side only | server enforcement, consent |
| School catalog | Must | 69 programs, invented coach/recruit data, unsourced UTRs | migration 012 import |
| Fit bands | Must | Inconsistent across screens | P1-FIT-1…4 |
| Plan (UTR history, trajectory) | Must | Works; projection unstable | outlier handling |
| Schools browse + detail | Must | Works; wrong "You" UTR on browse | P1-FIT-2 |
| Targets | Must | Works | — |
| Outreach tracker | Must | Works on branch; broken on prod | P0-4, P0-5, tier decision |
| Coach email draft | Must (honest version) | Fabricates facts | P0-4 |
| Family view + budget | Must | Works; join flow insecure | P0-2 |
| Billing (Whop) | Must | Works; tier self-assignable | P0-1 |
| Account deletion | Must | Soft flag only | P0-8 |
| Tournament fit checker | Should | Works, public | — |
| Events (tournaments/results) | Should | Works | calendar cramped |
| Sunday check-in | Should | Works | — |
| Training calendar / templates / copilot | Post-V1 | Built (Legacy + wizard) | remove from V1 surface |
| Notifications / weekly parent email | Post-V1 | Toggles only, nothing sends | hide |
| Public recruiting page | Post-V1 | Toggle only | hide |
| Transfer portal, similar players, probability, commitments, openings | Post-V1 | Not built | — |

## Product rules (non-negotiable)
See `/CLAUDE.md`. Short version: no invented data; bands not percentages;
"leaving" counts not "open spots"; Gmail compose link only; UTR self-report
only; parents read-only except budget.

## Pricing (decision needed — P1-PRICE-1)
Live: Free $0 · Player $19/mo · Family $39/mo. Coach outreach writes need
Family. Mockups want $12/$99yr and $19/$159yr. Decide which features each
tier unlocks, change Whop first, then code + RLS together.
