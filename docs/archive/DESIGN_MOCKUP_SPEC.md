> **Archived 2026-11-22.** The v1 mockup spec (Claude Design canvas, before
> launch). [`../DESIGN_MOCKUP_SPEC_V2.md`](../DESIGN_MOCKUP_SPEC_V2.md) is the
> current spec: it keeps these tokens and supersedes this file for /pricing,
> /login and /signup. Two things only this file describes, still the
> reference until v2 or the Figma file redraws them: the type scale
> (`components/seeded/ui/heading.ts` cites it) and the /family members card
> and invite box.

# Seeded mockup spec (source: Claude Design canvas "Seeded Redesign Mockups")

Extracted from Pricing, Onboarding, Family and DesignSystem mockups. Use the repo's existing tokens/components;
where they differ from this, this spec wins for /login, /signup, /pricing, /family.

## Design system — "Scoreboard calm"
- Court green = action, ball yellow = "you", clay = reach. Numbers in mono. One accent per screen.
- Colors: bg #F7F6F2 · surface #FFFFFF · ink #14181A · ink-2 #5C625F · primary/court #1F6B4A (hover #185A3E)
  · accent/ball #D7F25A · clay/reach #C2643A · warning #B7791F · error #C2362F · dark bg #0E1411
  · border #E4E2DA · input border #D6D3C8 · subtle row border #EFEDE6 · muted panel #FBFAF7
- Type: Inter (body), Inter Tight 600/700 (display/H1, letter-spacing -0.02em), JetBrains Mono (all numbers, tabular-nums).
  Display 56/36 · H1 36/28 · H2 24/20 · Body 16 (line-height 1.55). Action numbers never <14px or <4.5:1 contrast.
- Buttons: min-height 44px (48 on pricing CTAs), radius 8px, 15px/600. Primary = court bg + white. Secondary = white + #D6D3C8 border.
  Ghost = transparent + court text. Focus = 2px #D7F25A outline, offset 2px. Disabled = #E4E2DA bg, #8A8F8C text.
- Cards: white, 1px #E4E2DA, radius 12px, padding 24–28px.
- Chips (pill): Reach #FBEDE6/#9C4824/#F0CDBC · Target #E6F1EB/#1F6B4A/#BFDCCB · Likely #EEF3D6/#4A5A10/#D8E3A8
  · Estimated #FFF4DC/#7A5212/#F0DCAD · Unverified = dashed border.
- Inputs: height 44px, 1px #D6D3C8, radius 6px, 16px text; label 13px/500 ink-2 above. Error = 2px #C2362F border + red helper text.
- Spacing 4·8·12·16·24·32·48·64·96. Radius 6 / 10 / pill. Motion 100–240ms, no count-ups, respect reduced motion.
- Error banner: bg #FCEEED, border #F0C3BF, text #8E2620, always says what's safe + "Try again".

## /pricing (Pricing mockup)
- Header: "Seeded" wordmark (Inter Tight 700, 20px) left, "Sign in" link right. Max width 1200px, bg #F7F6F2.
- Centered H1 (Inter Tight 44px): "Your first fit report is free. Pay when you want a plan."
- Sub (17px ink-2, max 640px): "One skipped bad-fit tournament (entry plus travel) usually covers a year of Player."
- Segmented pill toggle (white pill, 1px border, 4px padding; active = ink bg + white text): "Yearly · 2 months free" | "Monthly". Default Yearly.
- 3 cards in a grid (minmax 300px), equal height:
  - Free — "See where you fit." $0 — secondary btn "Get my free fit report".
  - Player — "Know what to do every week." $99 / year (note "About $8.25 a month") or $12 / month (note "Or $99 a year") — primary btn.
  - Family — "For the parent who pays and wants to see progress." 2px court border. $159 / year ("About $13.25 a month") or $19 / month ("Or $159 a year") — primary btn.
  - Feature lists: ✓ in court green, 15px. Use the REAL features/limits from lib (tier gating 024), not the mockup's copy, where they differ.
- Price numbers in JetBrains Mono 40px/600.
- Footer line (14px ink-2): "Cancel in two clicks. Accounts for players under 18 are billed to a parent." (Only mention a trial if one actually exists.)
- Section "What stays free, always": school pages, your first fit report, our methodology.

## /login + /signup (Onboarding mockup "Save your report" card)
- Same header/bg as pricing. Centered card (max ~420px), white, radius 12px, padding 24px.
- H2 20px + 15px ink-2 subline.
- FIRST: secondary full-width button "Continue with Google" (only when NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true), then an "or" divider (1px #E4E2DA lines, 13px ink-2).
- Email (+ password) inputs per input spec. Signup also: "I am the" Player/Parent pill radio (selected = ink bg, white text), Birth year select,
  helper "Under 13? A parent creates the account and invites you."
- Primary full-width CTA. Small centered note 12px: "No card. We never sell player data."
- Onboarding progress chips: done = Target-green chip, current = ink chip, upcoming = plain chip.

## /family (Family mockup)
- Family members card: rows "Name — role chip" (e.g. "Player", "Parent · account holder").
- Invite box: dashed #D6D3C8 border, #FBFAF7 bg: "Invite another parent with code <mono bold CODE>".
- "Needs a parent decision" card: clay-tint item (#FBEDE6 / #F0CDBC) for the most urgent, muted panel for others.
- Approval cards from migration 026 should use this same card + chip language.
