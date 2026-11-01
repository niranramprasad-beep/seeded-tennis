import { cn } from "@/lib/utils";

// A single soft gradient-mesh blob, the hero's ambient-light source. Used
// sparingly (1-2 per page) behind headline content — the premium-SaaS
// backdrop treatment, not a decorative repeat.
export function GlowOrb({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute rounded-full blur-3xl", className)}
      style={{
        background:
          "radial-gradient(circle, rgb(var(--c-primary) / 0.22), rgb(var(--c-tennis) / 0.14) 45%, transparent 75%)",
      }}
    />
  );
}
