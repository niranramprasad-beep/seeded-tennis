# Copy cuts — round 1, from main @ 8018396; honesty labels are shortened, never cut

Top cuts
1. Cut every eyebrow that repeats its H1 or is a full sentence (landing :54/:75/:440, pricing :39, family date); use the short mobile hero H1 + subhead on desktop.
2. Parents see "read-only" once: keep sidebar subtitle + family pill; shorten the sidebar note to "You can edit: budget, notes." (family-view.test.ts update); drop "Parent ·" and "Player" in the footer.
3. Today: cut the checkpoint chip and per-action minutes, merge the two check-in surfaces, turn the chart legend into swatches (keep "never used for bands").
4. Schools table: move "(est. summer 2030)" from every row into the header; sr-only filter/search labels; trim expanded-row tails (keep "Estimate" chip and "not tracked" lines, shortened).
5. Pricing: cut "What stays free" section and duplicate "Saves $X" (pricing-data.test.ts update). School detail: drop the band-position chip, merge star + save button, keep only the estimate chip.

Landing (seeded-home-view.tsx)
- CUT eyebrow "College tennis recruiting, planned" :54–56/:75–77 (H1 says it)
- SHORTEN desktop H1 :79–80 to mobile H1: "Know which teams you can make, and what to do this month."
- SHORTEN subhead :89–92 to the mobile line (keep "estimated", {teamCount})
- MERGE small print :108–110 + card title :265 → "Your fit" / "Free · no card · about 90 seconds"; CUT :257
- Trust strip :395–409 → bold phrases only (keep "never a percent chance")
- CUT section eyebrow :440 (repeats FAQ :748)
- SHORTEN capability card bodies :420/:428/:432; MERGE 3 "Example" tags into one caption
- CUT "Skipped 2 bad-fit events… saved about $620" :644
- SHORTEN :670–672 (drop parenthetical); CUT founder subline :691–693; SHORTEN FAQ :752
- Flag: :356 and :205 pinned by lib/home-calculator.test.ts:33-34

Sidebar (sidebar.tsx)
- SHORTEN parent note :199–203 (lib/family-view.ts:137, test :140-143) → "You can edit: budget, notes."
- CUT "Tools" label :183–185 (keep divider); "Jump to…" → search icon + kbd :162–165
- SHORTEN "Parent · Billing" :470–471 → "Billing"; CUT "Player" :458; KEEP "Parent of Bailey · read-only" :69

Today (seeded-dashboard-layout.tsx)
- SHORTEN date line :146–149/:174 → season only; drop greeting :176–177
- CUT checkpoint chip :188–195; MERGE UTR chip + Update button → "UTR 9.40 · Update"
- SHORTEN + MERGE Sunday banner :217–219 with check-in bar :246–258
- Legend paragraph :283–285 → swatches; MERGE DataNote :278 + PaceUpsideNote :288
- CUT "{n} min" :359; SHORTEN ProjectionNote (projection-note.tsx:48), keep chip/year/value

Plan (seeded-roadmap-layout.tsx)
- KEEP "self-reported" + date :286 and "Not tracked" :291; "logged record" → "record" :296
- MERGE PaceUpsideNote :364 + GoalPaceWarning :365; CUT empty-state text :391
- "Show realistic targets (3 of 8)" → "Realistic only (3)" :434; collapse WhatIfPanel :440–445
- SHORTEN :452–457; consider folding "Closest schools" :474 into targets

Schools browser (seeded-schools-browser.tsx)
- CUT banner tail :672–674; CUT parent line :631; sr-only "Search" :579 and filter labels :796–818
- "All 37" → "All" :710; per-row "(est. summer 2030)" → column header :966–968/:862
- "Team range: estimate" → "Estimate" :863; row subline → "{division} · {state}" :953–955
- SHORTEN expanded-row lines :1020–1021, :992–993, :1027–1029; KEEP one estimate note (:1061/:1064/:1125)

School detail (seeded-school-detail.tsx)
- CUT UTR driver chip :217–220; SHORTEN pace row to one sentence :166–186
- SHORTEN "Consider instead" :236–237; CUT DataNote :279 (chip stays); H2 → "You vs team range" :253
- SHORTEN aid line :297–298; "Report an error" pill → foot link; MERGE star :329 + Save :362
- CUT :395; button → "Email the coach" :401

Pricing (seeded-pricing-view.tsx, pricing-data.ts)
- CUT eyebrow :39; SHORTEN subhead :48–49; CUT "What stays free, always" :177–202
- "Saves $45 a year" → cut (pricing-data.test.ts :128/:133/:148); MERGE small print :171–172
- SHORTEN cancel + people FAQs to 2–3 sentences (keep "Nothing you saved is deleted"); leave family tagline (pinned)

Family overview (dashboard-body.tsx)
- CUT long date eyebrow; H1 → "Bailey's season"; pill → "Read-only · Class of 2027"
- MERGE the three "Near limit/Over budget" signals (:107/:333/:185)
- SHORTEN/CUT empty states :91, :124, :146–147, :204–205, :240, :292
- SHORTEN :155, keep the estimate label
