"use client";

import { useState } from "react";
import type { PendingSkipDecision } from "@/lib/family-budget";
import { shortBadFitReason } from "@/lib/family-budget";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { cn } from "@/lib/utils";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Pixel-language from "18 Parent view + budget.png"'s "Needs a parent
// decision" card: a rose-tinted "Skip {event} ({date})? ... Saves about
// $X." panel per real bad-fit, still-saved (never entered) tournament —
// lib/family-budget.ts's pendingSkipDecisions(), scored by the same
// evaluateTournamentFit() /tournament-fit and /events use. The mockup's
// second example item ("Johns Hopkins ID camp — Coach invited Maya") has
// no real backing anywhere in this app (no "camp invite" data model
// exists), so it's deliberately not reproduced here — see the phase
// report.
export function NeedsDecisionCard({ decisions }: { decisions: PendingSkipDecision[] }) {
  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">Needs a parent decision</h2>
      <div className="mt-4 space-y-3">
        {decisions.length === 0 && (
          <EmptyState
            title="Nothing needs a decision right now."
            description="Bad-fit tournaments still on your saved list show up here."
          />
        )}
        {decisions.map((d) => (
          <SkipDecisionRow key={d.entry.id} decision={d} />
        ))}
      </div>
    </div>
  );
}

function SkipDecisionRow({ decision }: { decision: PendingSkipDecision }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const { entry, fit, wouldSave } = decision;
  return (
    <div className="rounded-[14px] border border-[#F0CDBC] bg-[#FBEDE6] p-4">
      <p className="font-semibold text-ink">
        Skip {entry.name} ({shortDate(entry.eventDate)})?
      </p>
      <p className="mt-1 text-sm text-stone">
        {shortBadFitReason(fit)} Saves about {money(wouldSave)}.
      </p>
      <button
        type="button"
        onClick={() => setWhyOpen((v) => !v)}
        aria-expanded={whyOpen}
        className="mt-1.5 text-sm font-semibold text-grass underline underline-offset-2"
      >
        See why
      </button>
      {whyOpen && (
        <ul className={cn("mt-2.5 flex flex-col gap-1.5 border-l-2 border-[#E4B49B] pl-3.5")}>
          {fit.reasons.map((reason, i) => (
            <li key={i} className="text-sm leading-relaxed text-stone">
              {reason.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
