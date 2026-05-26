import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-card border-[0.5px] border-line bg-line/40",
        className
      )}
      aria-hidden
    />
  );
}
