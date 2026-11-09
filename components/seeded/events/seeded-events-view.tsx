"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TrainingPlan } from "@/lib/types";
import { TrainingView } from "@/components/training/training-view";
import { MatchModeView } from "@/components/matches/match-mode-view";
import { useDesign } from "@/lib/context/design-context";
import { EventsInner } from "./events-inner";
import { cn } from "@/lib/utils";

type EventsTab = "calendar" | "matches";

// Seeded's /events merges Legacy's two separate features (Training's
// week/day/month planner and Match mode's match log/prep) into one nav
// slot. Now pixel-exact to "15 Events (schedule + results).png" for the
// Seeded design (see events-inner.tsx) — Legacy's opt-in escape hatch never
// had its own merged /events mockup (pre-redesign it just linked to
// separate /training and /match-mode pages), so it keeps the original
// tab-switcher behind the two whole, working legacy views, unchanged.
export function SeededEventsView({ plans }: { plans: TrainingPlan[] }) {
  const { design } = useDesign();

  if (design === "seeded") {
    return <EventsInner plans={plans} />;
  }

  return <LegacyEventsTabs plans={plans} />;
}

function LegacyEventsTabs({ plans }: { plans: TrainingPlan[] }) {
  const params = useSearchParams();
  const initialTab: EventsTab = params.get("tab") === "matches" ? "matches" : "calendar";
  const [tab, setTab] = useState<EventsTab>(initialTab);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-[rgb(var(--c-line))] bg-cream/90 px-6 py-3 backdrop-blur lg:px-10">
        <div className="inline-flex gap-1 rounded-pill border border-[rgb(var(--c-line))] bg-card p-1">
          <EventsTabButton active={tab === "calendar"} onClick={() => setTab("calendar")}>
            Calendar
          </EventsTabButton>
          <EventsTabButton active={tab === "matches"} onClick={() => setTab("matches")}>
            Matches
          </EventsTabButton>
        </div>
      </div>
      {tab === "calendar" ? <TrainingView plans={plans} /> : <MatchModeView />}
    </div>
  );
}

function EventsTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-[32px] rounded-pill px-4 font-sans text-sm font-semibold transition-colors",
        active ? "bg-ink text-cream" : "text-stone hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}
