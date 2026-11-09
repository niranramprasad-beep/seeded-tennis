"use client";

import { Badge } from "@/components/ui/badge";
import { useDesign } from "@/lib/context/design-context";

export function SchoolsHeader() {
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
      <h1 className="text-balance text-3xl font-light tracking-tight text-ink sm:text-4xl">
        Find your honest fit among <span className="serif-accent text-grass">D1 tennis</span>.
      </h1>
      <p className="mt-3 text-pretty leading-relaxed text-stone">
        Every program with real roster UTRs, minimum competitive levels, and academic
        rankings. Search freely — no account needed.
      </p>
    </div>
  );
}
