"use client";

import { Badge } from "@/components/ui/badge";
import type { CatalogCounts } from "@/lib/db/schools";
import { useDesign } from "@/lib/context/design-context";

export function SchoolsHeader({ counts }: { counts: CatalogCounts }) {
  const { design } = useDesign();

  // Seeded's title/subtitle/search row is now pixel-exact to Schools.dc.html
  // and lives inside SeededSchoolsBrowser itself (it needs the live ranked
  // count), so there's nothing for this marketing-style header to add here.
  if (design === "seeded") {
    return null;
  }

  return (
    <div className="max-w-2xl">
      <Badge variant="leaf" size="md" className="mb-3">
        Free to browse
      </Badge>
      {/* Said "among D1 tennis" directly above a count covering all three
          divisions — only 54 of the 68 are D1 (6 D2, 8 D3). Two true
          sentences that read together as "68 D1 programs", which is the
          same failure the derived counts were introduced to stop. */}
      <h1 className="text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
        Find your honest fit in <span className="serif-accent text-grass">college tennis</span>.
      </h1>
      {/* P0-7: was "Every program with real roster UTRs…" — the team UTRs
          are unverified estimates, not real roster data. The count is now
          passed in from the catalogue rather than typed here, because the
          literal disagreed with the number of rows the table showed. */}
      <p className="mt-3 text-pretty leading-relaxed text-stone">
        {counts.total} programs ({counts.men} men&apos;s, {counts.women} women&apos;s) with team
        UTR estimates, minimum competitive levels, and academic rankings. Search freely — no
        account needed.
      </p>
    </div>
  );
}
