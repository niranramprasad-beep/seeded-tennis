# Growth ideas

Written 2026-11-26. **A backlog of ideas, not a promise and not a plan to build
now.** Nothing in this file changes code, data or copy.

Two rules from [`CLAUDE.md`](../CLAUDE.md) decide when anything here can start:

- **Never build POST-V1 features while any P0/P1 is open.** Check
  [`MASTER_ROADMAP.md`](MASTER_ROADMAP.md) first.
- **Never promise email, notifications or public pages until the sending or
  serving code exists.** Seeded sends no email or push today.

Every idea names what must exist first and which rule it must not break. If an
idea needs a number (a price, a market size, a conversion rate), measure or source
it first. Do not write a guess into the repo.

## 1. Cover more of the catalog (the biggest lever)

The fit bands are only as useful as the catalog. Phase 1 covers the ACC and the
SEC; a player outside that range still sees few schools
([`CATALOG_EXPANSION.md`](CATALOG_EXPANSION.md)).

| Idea | Must exist first | Rule to keep |
|---|---|---|
| Add the next conferences to the owner's sheet, one at a time, in the same format (range, Program Info, roster, staff) | The sheet sync and roster pages are live; use the same import path | Official rosters only; every range shows source and date; no invented numbers |
| Women's programs at the same depth as men's | A per-gender check in the importer report | Same sourcing rule as men's |
| Division II, Division III and NAIA | A source for each team's roster; a decision on how bands treat divisions | Never fetch or scrape UTR; roster UTRs come from the sheet the owner maintains |
| A "freshness" view: which teams have an old roster check | The known TODO that a corrected range keeps its old "Roster checked" date | Show the source and date next to every roster number |

## 2. Make a player come back every week

Retention is the weak spot of any planning tool. These need real sending code
before any copy mentions them.

| Idea | Must exist first | Rule to keep |
|---|---|---|
| A weekly summary email to the player (and parent, if linked) | An email provider, unsubscribe handling, and the privacy policy updated by a lawyer or adult | No promise in copy until it ships; under-13 accounts need a parent; remove the matching entry from `lib/copy-honesty.test.ts` in the same commit |
| "Your list changed" notices when a school moves band | Stored band history per school, so a change is real, not computed on the fly | Never invent a change; show the UTR numbers behind it |
| Real reminders for outreach follow-ups ("Remind them" today only re-sorts a request) | The email or push system above | Do not let copy imply a reminder was sent when it was not |

## 3. Turn outreach into a loop

| Idea | Must exist first | Rule to keep |
|---|---|---|
| Track each coach contact: drafted, sent, replied, next step | A small table with RLS like the other player tables | Gmail stays compose-link only; Seeded never reads an inbox and never sends for the player |
| A follow-up draft built from the same real, logged results | The coach-email source map (`COACH_EMAIL_SOURCES`) extended, not bypassed | Every sentence traces to a stored value; UTR is "(self-reported)" |
| A coach-visible player page the family chooses to publish | A public-page route, an off-by-default switch, a privacy review for minors | No public page is promised until it exists; names only, never a real person's data in docs or tests |

## 4. Parents and families

| Idea | Must exist first | Rule to keep |
|---|---|---|
| A one-page season summary a parent can print or share | The read-only family view and budget already live | Parents still write only the budget and notes |
| A clear "what I'm paying for" view on the Family plan | Billing sync after checkout (open item) | Prices come only from `TIER_PRICE_USD` |
| Invite flow that explains the four-player, two-parent limit before someone hits it | `family_full` errors are already returned by the database | The limits live in `FAMILY_PLAN_MAX_*` |

## 5. Be found (SEO and trust)

| Idea | Must exist first | Rule to keep |
|---|---|---|
| Public school pages built from the sourced catalog | The catalog gate and [`SEO_CHECKLIST.md`](SEO_CHECKLIST.md) | Missing data says "Not tracked"; no invented rankings |
| A public "how the fit works" page that links to `/methodology` | Already live; keep it in step with the code | Four bands, real projection, never a snapshot |
| Plain-language guides for families new to college tennis recruiting | Nothing technical; needs an editor with real knowledge | No fabricated statistics or testimonials; no logo walls |

## 6. Measure what works

| Idea | Must exist first | Rule to keep |
|---|---|---|
| A short list of product events (sign-up finished, UTR logged, school saved, draft copied, upgrade started) | A decision on analytics, because Google Analytics is kept off minors' pages | Production only; no personal data in an event |
| A weekly one-screen dashboard for the owner | The events above | Real counts only; no fake or seeded numbers |

## 7. Make it easy for a team to keep building

| Idea | Why it helps | Rule to keep |
|---|---|---|
| A second reviewer for every migration and RLS change | The history shows reviews found real holes after the author called them done | Staging first, attack-tested as real roles, production only on the owner's go |
| Keep CLAUDE.md short; put incident stories in `archive/` | A short rulebook is read; a long one is skimmed | Move text verbatim, never delete a rule |
| Finish the `Player.currentUTR: number \| null` refactor | It makes the "no rating" case impossible to mishandle | One focused PR, with the sentinel test kept until it lands |

## How to use this file

1. Pick an idea only when the P0/P1 list is clear.
2. Write its decision in [`DECISIONS.md`](DECISIONS.md) with why and how to undo it.
3. Move it into [`TODO.md`](TODO.md) as a real item with an owner.
4. Delete it from this file in the same commit.
