import Link from "next/link";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}

// Pixel-exact to DesignSystem.dc.html's inline "Empty" pattern: dashed
// border-input border, 10px radius, 14px padding/font, bold lead-in + muted
// description + a court-green bold action link.
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-dashed border-input p-3.5 text-sm",
        className
      )}
    >
      <strong className="text-ink">{title}</strong>
      {description && <span className="text-stone"> {description}</span>}
      {action && (
        <>
          {" "}
          <Link href={action.href} className="font-semibold text-grass">
            {action.label}
          </Link>
        </>
      )}
    </div>
  );
}
