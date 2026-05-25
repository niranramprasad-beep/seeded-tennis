import type { ActivityType, Intensity } from "@/lib/types";

export interface ActivityStyle {
  label: string;
  color: string; // chart / dot color
  chipBg: string;
  chipText: string;
  dot: string;
}

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
    chipBg: "bg-[#EAF2DA]",
    chipText: "text-grass-900",
    dot: "bg-leaf-accent",
  },
  match: {
    label: "Match",
    color: "#CDB52E",
    chipBg: "bg-[#FAF4D2]",
    chipText: "text-[#6B6A2E]",
    dot: "bg-tennis",
  },
  recovery: {
    label: "Recovery",
    color: "#BBC79B",
    chipBg: "bg-[#EEF1E3]",
    chipText: "text-stone",
    dot: "bg-[#BBC79B]",
  },
  mental: {
    label: "Mental",
    color: "#6B6B5F",
    chipBg: "bg-[#ECEAE2]",
    chipText: "text-stone",
    dot: "bg-stone",
  },
};

export const INTENSITY_META: Record<
  Intensity,
  { label: string; chipBg: string; chipText: string }
> = {
  low: { label: "Low", chipBg: "bg-grass-50", chipText: "text-stone" },
  moderate: {
    label: "Moderate",
    chipBg: "bg-[#EAF2DA]",
    chipText: "text-grass-900",
  },
  high: { label: "High", chipBg: "bg-[#FAF4D2]", chipText: "text-[#6B6A2E]" },
};
