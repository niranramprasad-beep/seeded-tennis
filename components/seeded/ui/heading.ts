// One heading scale, used everywhere a Seeded page sets a title.
//
// The homepage had four different treatments for what are visually the same
// rank of heading. Measured in the browser rather than read off the source:
//
//   "One plan for the three things…"   Inter Tight 700  36px
//   "See if the plan is working…"      Inter Tight 700  36px
//   "Questions parents ask"            Inter Tight 700  32px
//   "How fit works"                    Inter      400  24px
//   "Who built this"                   Inter      400  24px
//
// The last two were not "a lighter weight" by choice — they had neither the
// display family nor a weight class, so they fell back to body Inter at 400
// and read as paragraphs that happened to be large.
//
// docs/DESIGN_MOCKUP_SPEC.md's scale is: Display 56/36 · H1 36/28 · H2
// 24/20 · Body 16. So a section title is the H1 step (36px) and a card
// title is the H2 step (24px), both in Inter Tight at 700. The section step
// carries the spec's -0.02em display tracking; the card step uses -0.01em,
// because at 24px the tighter value starts closing up the counters.

// `text-balance` is part of the scale, not a per-heading decision. Display
// type set at 36px in a 640px column is exactly where a last line of one
// word happens ("One plan for the three things that decide / recruiting."),
// and the only reliable fix is to let the browser even the lines out. Every
// heading that uses this scale gets it, which is what "site-wide" means
// here — not a class sprinkled on the three headings someone noticed.

/** Top-level section title — the H1 step of the scale (36px desktop). */
export const seededSectionHeading =
  "font-seeded text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-balance text-ink sm:text-4xl";

/** Card / sub-section title — the H2 step of the scale (24px desktop). */
export const seededCardHeading =
  "font-seeded text-xl font-bold leading-[1.2] tracking-[-0.01em] text-balance text-ink sm:text-2xl";
