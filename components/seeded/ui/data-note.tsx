import Link from "next/link";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Design system v2, rule 2: ONE calm data note per card, at most — an info
 * icon, one short sentence, and an "About our data" link to /methodology.
 *
 * This replaces the chip stacks ("Unverified", "Needs data", "General",
 * "Not tracked", "Unverified estimate") and the caveat paragraphs that piled
 * up on school pages and the fit report. A card that needs to say more about
 * its data is saying it in the wrong place: /methodology is where the long
 * version lives.
 */
export function DataNote({
  children,
  className,
  showLink = true,
}: {
  /** One short sentence. */
  children: ReactNode;
  className?: string;
  /** Off only where /methodology is already the next thing on the page. */
  showLink?: boolean;
}) {
  return (
    <p className={cn("flex items-start gap-2 text-sm leading-relaxed text-stone", className)}>
      <Info className="mt-[3px] h-4 w-4 shrink-0" aria-hidden />
      <span>
        {children}
        {showLink && (
          <>
            {" "}
            <Link
              href="/methodology"
              className="inline-flex min-h-11 items-center font-semibold text-grass underline underline-offset-2 sm:min-h-6"
            >
              About our data
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

/**
 * Rule 3 + "Estimates": anything projected wears a dashed "Estimate" chip.
 * Solid means logged by the player; dashed means Seeded worked it out.
 */
export function EstimateChip({ className, label = "Estimate" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-pill border border-dashed border-stone px-2 py-0.5 text-xs font-semibold text-stone",
        className
      )}
    >
      {label}
    </span>
  );
}
