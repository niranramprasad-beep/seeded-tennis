import type { DiagnosticProjection } from "@/lib/fit";
import type { DiagnosticAnswers } from "@/lib/onboarding/diagnostic";
import { MONTH_NAMES } from "@/lib/time";
import { EstimateChip } from "@/components/seeded/ui/data-note";

// Board 20's right-hand column: "Your profile so far" (fills in as they
// answer) and the dark "Projected UTR, summer before senior year" card.
//
// Every row and both cards render from the first paint with their final
// boxes — an unanswered row reads "—" — so filling one in never moves
// anything (rule 6, CLS < 0.05). The projection arrives finished from
// lib/fit.ts; this file only prints it.

const ENROLLMENT_LABEL = {
  fall_after_grad: "Fall after graduating",
  spring_after_grad: "Spring after graduating",
  not_sure: "Not sure yet",
} as const;

export function DiagnosticAside({
  answers,
  projection,
}: {
  answers: DiagnosticAnswers;
  projection: DiagnosticProjection | null;
}) {
  const rows: Array<[string, string, boolean?]> = [
    ["Filling in", answers.role === "parent" ? "Parent" : answers.role === "player" ? "Player" : "—"],
    ["Team", answers.gender === "female" ? "Women's" : answers.gender === "male" ? "Men's" : "—"],
    ["UTR today", answers.noUtrYet ? "None yet" : answers.utrTodayText.trim() || "—", true],
    ["About 6 months ago", answers.noUtrYet ? "—" : answers.utrSixMonthsText.trim() || "—", true],
    ["About a year ago", answers.noUtrYet ? "—" : answers.utrYearText.trim() || "—", true],
    ["Graduates", answers.gradYear ? `Class of ${answers.gradYear}` : "—"],
    [
      "Born",
      answers.birthMonth && answers.birthYear
        ? `${MONTH_NAMES[answers.birthMonth - 1]} ${answers.birthYear}`
        : "—",
    ],
    ["Starts college", answers.enrollmentTerm ? ENROLLMENT_LABEL[answers.enrollmentTerm] : "—"],
    ["GPA", answers.gpaText.trim() || "—", true],
  ];

  return (
    <aside aria-label="Your answers so far" className="flex min-w-0 flex-col gap-5">
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="m-0 font-seeded text-base font-semibold text-ink">Your profile so far</h2>
        <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value, mono]) => (
            <div key={label} className="contents">
              <dt className="text-stone">{label}</dt>
              <dd
                className={
                  mono && value !== "—" && value !== "None yet"
                    ? "m-0 truncate text-right font-mono tabular-nums text-ink"
                    : "m-0 truncate text-right text-ink"
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-label="Projected UTR, summer before senior year"
        className="rounded-xl bg-[rgb(var(--c-night))] p-5 text-[rgb(var(--c-night-text))]"
      >
        <p className="m-0 text-[13px] font-semibold text-[rgb(var(--c-night-soft))]">
          Projected UTR, summer before senior year
        </p>
        <div className="mt-2 flex min-h-[52px] items-center gap-3">
          {/* Lime marks "you" — the only lime on the page (rule 1). */}
          <span className="font-mono text-[44px] font-semibold leading-none tabular-nums text-lime-accent">
            {projection ? projection.display : "—"}
          </span>
          {projection?.isEstimate && (
            <EstimateChip className="border-[rgb(var(--c-night-soft))] text-[rgb(var(--c-night-soft))]" />
          )}
        </div>
        <p className="m-0 mt-2 min-h-[40px] text-[13px] leading-snug text-[rgb(var(--c-night-soft))]">
          {projection
            ? projection.note
            : answers.noUtrYet
              ? "No UTR yet, so there is nothing to project."
              : "Fills in once you add a UTR and a grad year."}
        </p>
      </section>
    </aside>
  );
}
