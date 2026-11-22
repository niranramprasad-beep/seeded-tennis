# Seeded design mockups v2 (Nov 16, post-launch)

Source: the "Seeded Redesign Mockups" canvas, boards 19–23 (claude.ai artifact VF2PKmid2aohsQ5iyv7QQR).
Claude Code cannot open the canvas, so this file is the spec. It extends docs/archive/DESIGN_MOCKUP_SPEC.md (same tokens; that file also still describes the type scale and the /family members card and invite box, which v2 does not redraw). Design polish round 1 (2026-11-22) follows a Figma file where it differs from these boards: DECISIONS 2026-11-22.
Mockup numbers are illustrative. In the app every number comes from real rows; never copy mockup data.

## Tokens (unchanged from v1 — use existing CSS variables, never raw hex)
bg #F7F6F2 · surface #FFFFFF · border #E4E2DA · border-strong #D6D3C8 · ink #14181A · ink-2 #5C625F
primary (court) #1F6B4A, hover #185A3E · accent (ball, "you" only) #D7F25A · clay (reach) #C2643A
warning #B7791F (tint #FFF4DC / text #7A5212) · error #C2362F (tint #FCEEED / text #8E2620) · dark bg #0E1411
Type: Inter (body), Inter Tight (display/H1/H2), JetBrains Mono (every number: UTR, prices, dates in tables)
Radius: 8 buttons/inputs, 12 cards, 16 large cards (auth, onboarding), pill for chips/toggles.

## Board 23 — Design system v2: the 8 rules (enforce site-wide)
1. ONE green (primary) button per screen. Lime (#D7F25A) is never a button fill; it only marks "you" (range-bar dot, your row, your number on dark).
2. ONE calm data note per card, max: info icon + one short sentence + "About our data" link (→ /methodology). No chip stacks ("Unverified", "Needs data", "General", "Not tracked"), no caveat paragraphs.
3. Badges only say what's true today. Allowed: "Recommended", "New", "Estimate" (dashed). Banned (guard test): most popular, best-selling, #1, trusted by, thousands of.
4. Plain words, middle-school reading level. Replace: "half academic rank, half the unverified team-level estimate" → "Mixes academics and team level"; "edition year not recorded" → say nothing; "Not tracked" → "Add your UTR to see your fit"; raw auth errors → "That email and password don't match".
5. Cards in a row share a height (grid + align-items:stretch). A card with one sentence merges into a neighbor or becomes a line of text.
6. Skeletons have the final layout's exact boxes. CLS < 0.05 everywhere.
7. One vertical rhythm: 96px between page sections (64 on phones), 40 heading→content, 20 card gap, 12 eyebrow→title.
8. Focus ring on light = 2px #1F6B4A, offset 2 (lime is too pale on light). Lime ring only on dark. Tap targets ≥44px phone, ≥24px desktop.
Shared parts: ONE header (logo dot + Seeded · Fit report · Tournament checker · Schools · For parents · Pricing · Sign in · primary "Get my free fit report") and ONE slim footer (Seeded · How we calculate fit · Privacy · Terms · support@seededtennis.com) on every route. (The Legacy switch that lived in Settings → Appearance was deleted with Legacy on 2026-11-20; Appearance is Light / Dark / Match system.)
Estimates: anything projected = dashed line/band + dashed "Estimate" chip. Solid = logged by the player.

## Board 19 — /pricing v2
- Header (shared), Pricing link aria-current.
- Hero centered: eyebrow "PRICING"; H1 48px Inter Tight, two lines, plain ink, NO gradient text: "Your first fit report is free." / "Pay when you want a plan."; sub 18px ink-2: "Every plan uses the same fit math. Paid plans add the weekly tools: unlimited schools, coach outreach and a parent view."
- Toggle pill (aria-pressed): "Yearly · save about 30%" | "Monthly". (Math: $99 vs $144 = 31%; $159 vs $228 = 30%. Do not say "3 months free".)
- 3 cards, equal height, each a grid with rows [name+tagline][price block, fixed 92px][CTA][features]. So CTAs and feature lists line up across cards.
  - Free: "$0 forever", "No card needed.", SECONDARY "Start free". Features: Browse 68 D1, D2 and D3 programs · Your fit report · Track 3 target schools · Every school page.
  - Player: 2px primary border + small solid "Recommended" chip on the top edge (no gradient, no sparkle icon). Yearly "$99 per year / About $8.25 a month. Saves $45 a year."; monthly "$12 per month / Or $99 a year." PRIMARY "Choose Player". Features: Everything in Free · Unlimited target schools · Coach outreach: drafts and a pipeline · Your year-by-year roadmap.
  - Family: yearly "$159 per year / About $13.25 a month. Saves $69 a year."; monthly "$19 / Or $159 a year." SECONDARY "Choose Family". Features: Everything in Player · Parent dashboard, read-only · Season budget for the family · Weekly family report.
  - Prices in JetBrains Mono for ALL three (live site mixes fonts today).
- Under cards, centered 14px: "Checkout is handled by Whop. Cancel any time from your Whop account." / "Players under 13 need a parent or guardian to approve the account."
- "What stays free, always": H2 + 3 equal cards (Every school page / Your fit report / How we calculate fit + "Read it" link). Replaces the one-line boxed banner.
- "Compare every feature": table card, sticky header row (Free / Player in green / Family), group rows SCHOOLS · PLANNING · FAMILY, ✓ in primary, "—" with aria-label "Not included", target schools "3 / Unlimited / Unlimited". GENERATE rows from FEATURE_TIER — never hand-write.
- "Questions" FAQ with <details>: Is the fit report really free? · What happens if I cancel? · Does a parent need the Family plan? · Where do the numbers come from? (answers must match real behavior; check Whop cancel flow + tier downgrade code before writing).
- Shared slim footer.

## Board 20 — /onboarding premium diagnostic (one question per screen, ~90s)
Layout: slim header (logo, center progress "Question N of 9" + "About 90 seconds" + 6px green progress bar with role=progressbar, Sign in link). Main = large white card (radius 16, padding 48, min-height 560, aria-live=polite) + right aside (320px) "Your profile so far" summary card + dark "Projected UTR, summer before senior year" card (mono 44px lime number + dashed "Estimate" chip + one-line note). Footer row in card: Back (secondary), Skip (ghost, optional steps only), Continue (primary, disabled until answered).
Questions (big 34px Inter Tight question + 16px help line):
0 Who's filling this in? — big option rows: I'm the player / I'm a parent
1 Which team are you aiming for? — Men's tennis / Women's tennis
2 What's your UTR today? — big mono input (1.00–16.50) + inline error + ghost "I don't have a UTR yet" (skips 3–4; NEVER stores a placeholder rating)
3 (Optional) What was it about 6 months ago? — label shows the actual month ("UTR around May 2026")
4 (Optional) And about a year ago?
5 When do you graduate high school? — pills Class of 2027…2031. Help: "We project your rating to the summer before senior year."
6 When were you born? — Month + Year selects ONLY (no day). Under-13 note.
7 When do you plan to start college? — Fall after I graduate / Spring after (gap semester) / Not sure yet
8 (Optional) Unweighted GPA (0.0–4.0)
9 Result: "We'll measure you at summer {grad-1}, the summer before senior year." + primary "See my fit report" + secondary "Save it with a free account" + "No card. We never sell player data."
Projection (must call lib/fit.ts single source — no new math in UI): pace from (today − 1yr ago)/12 or (today − 6mo ago)/6 per month, carried to June of grad-1. No past rating → use today's rating and say so. Target summer already passed → use today's rating and say so. Aside summary fills in live.

## Board 21 — /login, /signup, /reset-password (+ "Check your email" state)
Centered card, max ~440px, radius 16, padding 36, on bg, slim header with logo only.
- Sign in: H1 "Welcome back" / "Sign in to see your fit report and this week's plan." · SECONDARY "Continue with Google" (show only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED) · "or with email" divider · error banner (error tint) "That email and password don't match. Try again, or reset your password." · Email · Password with "Forgot it?" link in label row · PRIMARY "Sign in" · "New here? Create a free account".
- Sign up: "Save your fit report" / "Free. No card. We'll turn your report into a plan." · Google · divider · "I'm the" Player/Parent radio chips · Email · Password + hint "8+ characters. Avoid one you use elsewhere." · PRIMARY "Create free account" · under-13 + Terms/Privacy line.
- Reset: "Reset your password" / "We'll email you a link. It works for 1 hour." (verify Supabase expiry before using "1 hour") · PRIMARY "Send reset link" · Back to sign in.
- Check your email: mail icon in green-tint circle, "We sent a link to {email}. It comes from support@seededtennis.com." "Nothing after 2 minutes? Check spam, or send it again."

## Board 22 — Parent dashboard v2 (/family overview) — week-1 TODO #1
Parent sidebar: Overview · Weekly reports · Budget · Schools · Settings, plus a note "You're viewing {child}'s account. You can edit the budget and send notes. Everything else is {child}'s."
Header: eyebrow date, H1 "{child}'s season at a glance", read-only pill "Read-only · {child}, Class of {year}", secondary "Send {child} a note".
KPI row (4 equal cards): UTR (mono, "+0.50 since February" delta in green) · Target schools ("All 3 are Target or Likely") · Season spend ("$2,460 / of $3,000 · 82% used") · Next event (name, date, place).
Hero chart card: UTR trend — solid line + dots for logged results, lime dot for today with value, vertical dotted "Today" line, dashed projection line + dashed green-tint band to summer before senior year labeled "≈ 9.09 estimate", clay dashed horizontal line "Target schools start at {lowest target floor}". Legend: Logged / Estimate / Target schools start. role=img with full-sentence aria-label. Caption: "At this pace {child} reaches the start of her target range around {month}." Projection via lib/fit.ts only.
Grid of 4 equal cards: Season budget (per-category bars: green normal, amber + "Near limit" chip at ≥90%, red + "Over by $X" chip when over; calm red-tint message "Gear is $60 over. Lessons has $380 left, so the season total is still under budget."; "Edit budget" secondary) · Recent expenses (last 5: mono date, item · category, mono amount; "See all") · Target schools (rows with band chips; "Bands use {child}'s projected X (estimate)") · For you this week (action rows: report ready → primary "Read it"; over budget → "Adjust"; next event → "Check" in tournament checker).
Color never carries meaning alone: every amber/red state also has a text chip.
Parent profile/settings: NO UTR or player stats fields anywhere.
