import { cn } from "@/lib/utils";
import type { School } from "@/lib/types";

interface SchoolBadgeProps {
  school: Pick<
    School,
    "shortName" | "primaryColor" | "secondaryColor" | "textColor"
  >;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const cleaned = name.replace(/[^A-Za-z\s]/g, "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SchoolBadge({ school, size = 48, className }: SchoolBadgeProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: school.primaryColor,
        color: school.textColor,
        boxShadow: `inset 0 0 0 ${Math.max(2, size * 0.06)}px ${school.secondaryColor}`,
        fontSize: size * 0.34,
        letterSpacing: "-0.02em",
      }}
      aria-hidden
    >
      {initials(school.shortName)}
    </div>
  );
}
