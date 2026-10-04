import type { ActivityType, Intensity } from "@/lib/types";

export interface ActivityStyle {
  label: string;
  color: string; // chart / dot color
  chipBg: string;
  chipText: string;
  dot: string;
}

// Every chipBg/chipText pair below uses a theme CSS variable (never a fixed
// hex), so contrast holds in both light and dark themes automatically —
// these used to be fixed light-mode hex pairs (e.g. bg-[#FAF4D2] +
// text-[#6B6A2E]) that went low-contrast or invisible once the page
// background itself could be dark.
export const ACTIVITY_META: Record<ActivityType, ActivityStyle> = {
  court: {
    label: "Court",
    color: "#2D4A2B",
    chipBg: "bg-grass-50",
    chipText: "text-grass",
    dot: "bg-grass",
  },
  gym: {
    label: "Gym",
    color: "#97C459",
    chipBg: "bg-leaf-accent/15",
    chipText: "text-leaf-accent",
    dot: "bg-leaf-accent",
  },
  match: {
    label: "Match",
    color: "#CDB52E",
    chipBg: "bg-gold/15",
    chipText: "text-gold",
    dot: "bg-gold",
  },
  recovery: {
    label: "Recovery",
    color: "#BBC79B",
    chipBg: "bg-stone/10",
    chipText: "text-stone",
    dot: "bg-stone",
  },
  mental: {
    label: "Mental",
    color: "#6B6B5F",
    chipBg: "bg-ink/10",
    chipText: "text-stone",
    dot: "bg-ink/60",
  },
};

export const INTENSITY_META: Record<
  Intensity,
  { label: string; chipBg: string; chipText: string }
> = {
  low: { label: "Low", chipBg: "bg-grass-50", chipText: "text-grass" },
  moderate: {
    label: "Moderate",
    chipBg: "bg-leaf-accent/15",
    chipText: "text-leaf-accent",
  },
  high: { label: "High", chipBg: "bg-gold/15", chipText: "text-gold" },
};
