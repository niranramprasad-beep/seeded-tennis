"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarButtonProps {
  starred: boolean;
  onToggle: () => void;
  /** School name, used only to build the aria-label. */
  label: string;
  className?: string;
}

// Shared star-to-target affordance — every row/card showing a school (the
// Schools table, School Profile, Plan's target list) renders this same
// button wired to the same lib/hooks/use-star-schools.ts mechanism, never
// a one-off per page. Lives inside a clickable row in some callers, so it
// always stops propagation.
export function StarButton({ starred, onToggle, label, className }: StarButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={starred}
      aria-label={starred ? `Remove ${label} from your targets` : `Add ${label} to your targets`}
      className={cn(
        // 28px rendered — under the 44px minimum on a phone. The hit area grows
        // with a negative margin so rows keep their height.
        "-m-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-light transition-colors hover:bg-cream hover:text-ink sm:-m-0 sm:h-8 sm:w-8",
        starred && "text-lime-accent",
        className
      )}
    >
      <Star className={cn("h-[18px] w-[18px]", starred && "fill-current")} aria-hidden />
    </button>
  );
}
