import { SCHOOL_LOGO_DIR, schoolLogoFile } from "@/lib/school-logos";
import type { Division } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SchoolMonogram } from "./school-monogram";

// The tile beside a school's name: its logo over its initials, or just the
// initials when there is no logo we may use (docs/SCHOOL_LOGOS.md).
//
// The logo is a CSS background on an inert layer, never an <img>: there is no
// "Save image" menu, nothing to drag, and on a phone nothing to long-press.
// The addresses themselves are guarded in next.config.mjs. Together they make
// copying a logo awkward; nothing shown in a browser can be made uncopyable.
//
// Every file is opaque, so a loaded logo covers the initials, and one that
// fails to load leaves them showing.
export function SchoolMark({
  slug,
  name,
  division,
  size = "sm",
  className,
}: {
  slug: string;
  name: string;
  division: Division;
  size?: "sm" | "lg";
  className?: string;
}) {
  const file = schoolLogoFile(slug);
  if (!file) return <SchoolMonogram name={name} division={division} size={size} className={className} />;
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0 select-none", className)}>
      <SchoolMonogram name={name} division={division} size={size} />
      <span
        className="pointer-events-none absolute inset-0 rounded-[10px] border border-line bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${SCHOOL_LOGO_DIR}/${file})` }}
      />
    </span>
  );
}
