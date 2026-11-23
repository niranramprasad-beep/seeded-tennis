// School logos: one small picture per university, shown as the tile beside its
// name (components/seeded/ui/school-mark.tsx). Sources, copyright status and
// the rules are in docs/SCHOOL_LOGOS.md; lib/school-logos.test.ts fails the
// build if a file has no row there. A school with no entry keeps its initials.

export const SCHOOL_LOGO_DIR = "/school-logos";

const LOGO_FILE: Record<string, string> = {
  georgia: "sc414338046.webp",
  michigan: "sbe41247fc4.webp",
  "north-carolina": "sfa987c15ae.webp",
  northwestern: "se4db748691.webp",
  "notre-dame": "se0e1749267.webp",
  "ohio-state": "s26b780db8c.webp",
  stanford: "s469ea1257e.webp",
  texas: "s50a1a17496.webp",
  usc: "se84ec6d0aa.webp",
  vanderbilt: "sdd59559c7f.webp",
  "virginia-tech": "sac6265d9cc.webp",
};

/** A program's slug without its team suffix: one logo per university. */
export function universityKey(slug: string): string {
  return slug.replace(/-(?:m|w)$/, "");
}

/** The logo's file name, or null when the school has none we may use. */
export function schoolLogoFile(slug: string): string | null {
  return LOGO_FILE[universityKey(slug)] ?? null;
}
