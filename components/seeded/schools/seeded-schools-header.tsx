"use client";

import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/shared/reveal";
import { useDesign } from "@/lib/context/design-context";

export function SchoolsHeader() {
  const { design } = useDesign();

  if (design === "seeded") {
    return (
      <Reveal className="max-w-2xl">
        <span
          className="inline-flex rounded-pill px-3 py-1 font-seeded text-xs font-semibold text-white"
          style={{ background: "var(--s-accent-gradient)" }}
        >
          Free to browse
        </span>
        <h1 className="mt-4 text-balance font-seeded text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Find your honest fit among <span className="seeded-gradient-text">D1 tennis</span>.
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-stone">
          Every program with real roster UTRs, minimum competitive levels, and academic
          rankings. Search freely — no account needed.
        </p>
      </Reveal>
    );
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
