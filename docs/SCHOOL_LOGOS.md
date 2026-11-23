# School logos

The small tile beside a school's name on /schools and on the school page shows
the school's logo when there is one we may use, over the initials tile it
replaces. Asked for by Herdy on 2026-11-23; **live since PR #52 the same day,
on Niran's go** (see "Still open").

## Rules

1. **Only files Wikimedia Commons marks "Public domain"**, which speaks to
   copyright only. They are still the schools' **trademarks**. They are used
   to name the school a row is about, at tile size, and for nothing else:
   never on marketing, pricing, share images or anything that could look like
   an endorsement.
2. **Never redrawn, recoloured or combined.** Each vector was trimmed, centred
   on white and scaled down. "Higher quality" comes from starting at the vector.
3. **No file we may use, no logo.** The school keeps its initials.
4. Only WEBP tiles of 144 px ship (3x of the largest tile). The vectors are
   not in this repository.
5. A new logo needs its file, its line in `lib/school-logos.ts` and its row
   below, in the same commit (`lib/school-logos.test.ts`).

## What stops copying, and what does not

Stopped: the "Save image" menu, dragging and long-pressing (the logo is an
inert CSS background, not an `<img>`); opening its address, framing it,
fetching it from a script and loading it from another site (the 404 page
answers, `next.config.mjs`); Google Images (`noimageindex`).

Not stopped, because nothing in a browser can: a screenshot, "Save page as",
the developer tools, or a program that pretends to be a page. **While this
repository is public, anyone can also download the files from GitHub.**

## Still open

- An adult or lawyer on the trademark question (the product is sold).
  Removing one school's logo is deleting its line and its file.
- The repository private, or the files kept out of it.
- A line of copy, for Niran to word, for example beside the one on
  /methodology: "Seeded is not affiliated with any college. Logos belong to
  their schools."

## Sources (11 of 37 universities)

| School | File | Commons file | Copyright on Commons | Trademark noted there |
|---|---|---|---|---|
| University of Georgia | `sc414338046.webp` | [Georgia Athletics logo.svg](https://commons.wikimedia.org/wiki/File:Georgia_Athletics_logo.svg) | Public domain | yes |
| University of Michigan | `sbe41247fc4.webp` | [Michigan Wolverines logo.svg](https://commons.wikimedia.org/wiki/File:Michigan_Wolverines_logo.svg) | Public domain | yes |
| University of North Carolina at Chapel Hill | `sfa987c15ae.webp` | [North Carolina Tar Heels logo.svg](https://commons.wikimedia.org/wiki/File:North_Carolina_Tar_Heels_logo.svg) | Public domain | yes |
| Northwestern University | `se4db748691.webp` | [Northwestern Wildcats logo.svg](https://commons.wikimedia.org/wiki/File:Northwestern_Wildcats_logo.svg) | Public domain | yes |
| University of Notre Dame | `se0e1749267.webp` | [Notre Dame Fighting Irish logo.svg](https://commons.wikimedia.org/wiki/File:Notre_Dame_Fighting_Irish_logo.svg) | Public domain | yes |
| The Ohio State University | `s26b780db8c.webp` | [Ohio State Buckeyes logo.svg](https://commons.wikimedia.org/wiki/File:Ohio_State_Buckeyes_logo.svg) | Public domain | yes |
| Stanford University | `s469ea1257e.webp` | [Stanford Cardinal logo.svg](https://commons.wikimedia.org/wiki/File:Stanford_Cardinal_logo.svg) | Public domain | yes |
| University of Texas at Austin | `s50a1a17496.webp` | [Texas Longhorns logo.svg](https://commons.wikimedia.org/wiki/File:Texas_Longhorns_logo.svg) | Public domain | not marked |
| University of Southern California | `se84ec6d0aa.webp` | [USC Trojans logo.svg](https://commons.wikimedia.org/wiki/File:USC_Trojans_logo.svg) | Public domain | yes |
| Vanderbilt University | `sdd59559c7f.webp` | [Vanderbilt Commodores (2022) logo.svg](https://commons.wikimedia.org/wiki/File:Vanderbilt_Commodores_%282022%29_logo.svg) | Public domain | yes |
| Virginia Tech | `sac6265d9cc.webp` | [Virginia Tech Hokies logo.svg](https://commons.wikimedia.org/wiki/File:Virginia_Tech_Hokies_logo.svg) | Public domain | yes |

## Schools that keep their initials

The 37 are the universities built into the app. A school that joins the
list from the spreadsheet (the database) keeps its initials until it has a row above.

- Barry University: no public-domain file found on Wikimedia Commons.
- University of West Florida: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Columbus State University: no public-domain file found on Wikimedia Commons.
- Emory University: no public-domain file found on Wikimedia Commons.
- University of Chicago: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Johns Hopkins University: no public-domain file found on Wikimedia Commons.
- Middlebury College: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Cornell University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Duke University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- University of Virginia: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- University of California, Los Angeles: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- University of Florida: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Wake Forest University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- University of Illinois Urbana-Champaign: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Pepperdine University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Baylor University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Texas Christian University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- North Carolina State University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- University of Pennsylvania: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Princeton University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Harvard University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Yale University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Columbia University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Brown University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Dartmouth College: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
- Tulane University: a public-domain file exists on Wikimedia Commons, not fetched yet (its download limit).
