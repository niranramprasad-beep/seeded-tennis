"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Eye } from "lucide-react";
import type { BudgetBar, ParentDashboardModel, WeekAction } from "@/lib/parent-dashboard";
import { formatMoney } from "@/lib/parent-dashboard";
import { cn } from "@/lib/utils";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";
import { ProjectionNote } from "@/components/seeded/ui/projection-note";
import { UtrTrendChart, UtrTrendLegend } from "./utr-trend-chart";
import * as L from "./layout";

// Board 22, drawn from a ParentDashboardModel (lib/parent-dashboard.ts).
// This file decides nothing: every number and sentence arrives in `model`.
//
// The same body renders the paywall's Example preview (`preview`), with
// sample rows run through the same builders — so the preview IS the layout,
// and in preview every control is an inert look-alike: a locked family can
// neither send a note nor edit a budget from it.

const TARGET_ROWS_SHOWN = 6;

export interface DashboardBodyProps {
  model: ParentDashboardModel;
  /** "Wednesday, November 18", or "Example" in the preview. */
  eyebrow: string;
  /** The paywall's sample — every control inert, no green button. */
  preview?: boolean;
  /** Said when the family has more than one player (multiPlayerNote). */
  playerNote?: string | null;
  canEditBudget?: boolean;
  onSendNote?: () => void;
  onEditBudget?: () => void;
  seasonLabel: string;
}

export function DashboardBody({
  model,
  eyebrow,
  preview = false,
  playerNote,
  canEditBudget = false,
  onSendNote,
  onEditBudget,
  seasonLabel,
}: DashboardBodyProps) {
  const child = model.childFirst;
  // The preview sits under the paywall's own H1.
  const Title = preview ? "p" : "h1";
  return (
    <>
      <div className={L.HEADER}>
        <div className="min-w-0">
          <p className={L.EYEBROW}>{eyebrow}</p>
          <Title className={L.H1}>{child}&rsquo;s season at a glance</Title>
          <div className={L.PILL_ROW}>
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-line bg-card px-3 text-sm font-medium text-stone">
              <Eye className="h-4 w-4 text-grass" aria-hidden />
              Read-only · {child}
              {model.classYear != null && <>, Class of {model.classYear}</>}
            </span>
            {playerNote && <span className="text-sm text-stone">{playerNote}</span>}
          </div>
        </div>
        {preview ? (
          <InertButton>Send {child} a note</InertButton>
        ) : (
          <SeededButton variant="secondary" onClick={onSendNote}>
            Send {child} a note
          </SeededButton>
        )}
      </div>

      <div className={L.KPI_ROW}>
        <KpiCard label="UTR">
          <p className={cn("mt-2 text-ink", model.utr.hasUtr ? "font-mono text-[30px] leading-9" : "font-seeded text-2xl font-semibold leading-9")}>
            {model.utr.value}
          </p>
          <p className="mt-auto pt-3 text-sm text-stone">
            {model.utr.deltaText ? (
              <span className={cn("inline-flex items-center gap-1", model.utr.direction === "up" && "font-semibold text-grass")}>
                {model.utr.direction === "up" && <ArrowUpRight className="h-4 w-4" aria-hidden />}
                {model.utr.direction === "down" && <ArrowDownRight className="h-4 w-4" aria-hidden />}
                <span className="font-mono">{model.utr.deltaAmount}</span> since {model.utr.since}
              </span>
            ) : model.utr.hasUtr ? (
              "Not enough ratings logged to show a change."
            ) : (
              `${child} hasn't logged one.`
            )}
          </p>
        </KpiCard>

        <KpiCard label="Target schools">
          <p className="mt-2 font-mono text-[30px] leading-9 text-ink">{model.targets.value}</p>
          <p className="mt-auto pt-3 text-sm text-stone">{model.targets.sentence}</p>
        </KpiCard>

        <KpiCard label="Season spend">
          <p className="mt-2 font-mono text-[30px] leading-9 text-ink">{model.spend.value}</p>
          <p className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-sm text-stone">
            <span className={cn(model.spend.status != null && "font-mono")}>{model.spend.detail}</span>
            {model.spend.status === "near" && <StatusChip tone="near">Near limit</StatusChip>}
            {model.spend.status === "over" && <StatusChip tone="over">Over budget</StatusChip>}
          </p>
        </KpiCard>

        <KpiCard label="Next event">
          {model.nextEvent ? (
            <>
              <p className="mt-2 line-clamp-2 font-seeded text-lg font-semibold leading-6 text-ink">{model.nextEvent.name}</p>
              <p className="mt-auto pt-3 text-sm text-stone">
                <span className="font-mono">{model.nextEvent.dateLabel}</span>
                {model.nextEvent.place && <> · {model.nextEvent.place}</>}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-seeded text-lg font-semibold leading-6 text-ink">Nothing coming up</p>
              <p className="mt-auto pt-3 text-sm text-stone">Events {child} saves show up here.</p>
            </>
          )}
        </KpiCard>
      </div>

      <section className={L.CHART_CARD} aria-labelledby="utr-trend-title">
        <div className={L.CHART_HEAD}>
          <h2 id="utr-trend-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
            UTR trend
            {model.chart?.projection && <EstimateChip />}
          </h2>
          {model.chart && (
            <UtrTrendLegend showEstimate={model.chart.projection != null} showFloor={model.chart.targetFloor != null} />
          )}
        </div>
        <div className={L.CHART_PLOT}>
          {model.chart && model.chartAriaLabel ? (
            <UtrTrendChart model={model.chart} ariaLabel={model.chartAriaLabel} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-input px-6 text-center">
              <p className="max-w-sm text-sm text-stone">
                <strong className="text-ink">No UTR yet.</strong> When {child} logs a rating, the trend and an estimate
                to the summer before senior year show here.
              </p>
            </div>
          )}
        </div>
        <div className={L.CHART_FOOT}>
          {model.chart && <p className="text-[15px] text-ink">{model.chartCaption}</p>}
          {model.chart?.targetFloor != null && (
            <DataNote className="mt-2">Where target schools start is our estimate of team level, not a published roster.</DataNote>
          )}
        </div>
      </section>

      <div className={L.GRID}>
        <section className={L.GRID_CARD} aria-labelledby="budget-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="budget-title" className="text-lg font-semibold text-ink">
              Season budget <span className="font-normal text-stone">· {seasonLabel}</span>
            </h2>
            {canEditBudget &&
              (preview ? (
                <InertButton>Edit budget</InertButton>
              ) : (
                <SeededButton variant="secondary" className="min-h-10 px-4" onClick={onEditBudget}>
                  Edit budget
                </SeededButton>
              ))}
          </div>
          {model.budget.hasBudget ? (
            <>
              <BudgetRow bar={model.budget.total} strong />
              <ul className="mt-2 flex flex-col">
                {model.budget.categories.map((c) => (
                  <li key={c.key}>
                    <BudgetRow bar={c} />
                  </li>
                ))}
              </ul>
              {model.budget.message && (
                <p
                  className={cn(
                    "mt-auto rounded-lg border px-3.5 py-3 text-sm",
                    model.budget.message.tone === "over"
                      ? "border-error/25 bg-error-bg text-error-strong"
                      : "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]"
                  )}
                >
                  {model.budget.message.text}
                </p>
              )}
            </>
          ) : (
            <EmptyState
              className="mt-4"
              title="No season budget yet."
              description={
                canEditBudget
                  ? "Set a total, and entered tournaments and logged expenses count against it."
                  : "A parent can set one, and entered tournaments and logged expenses count against it."
              }
            />
          )}
        </section>

        <section className={L.GRID_CARD} aria-labelledby="expenses-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="expenses-title" className="text-lg font-semibold text-ink">
              Recent expenses
            </h2>
            {preview ? (
              <span className="text-sm font-semibold text-grass">See all</span>
            ) : (
              <Link href="/family/budget" className="inline-flex min-h-11 items-center text-sm font-semibold text-grass underline-offset-2 hover:underline sm:min-h-6">
                See all
              </Link>
            )}
          </div>
          {model.expenses.length ? (
            <ul className="mt-3 flex flex-col">
              {model.expenses.map((x) => (
                <li key={x.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2.5 text-sm last:border-0">
                  <span className="inline-block min-w-[3.6rem] whitespace-nowrap font-mono text-stone">{x.dateLabel}</span>
                  <span className="min-w-0 truncate text-ink">
                    {x.item} <span className="text-stone">· {x.category}</span>
                  </span>
                  <span className="font-mono text-ink">{x.amount}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-4"
              title="No spend logged yet."
              description="Logged expenses and entered tournaments show up here."
            />
          )}
        </section>

        <section className={L.GRID_CARD} aria-labelledby="targets-title">
          <h2 id="targets-title" className="text-lg font-semibold text-ink">
            Target schools
          </h2>
          {model.targets.rows.length ? (
            <>
              <ul className="mt-3 flex flex-col">
                {model.targets.rows.slice(0, TARGET_ROWS_SHOWN).map((r) => (
                  <li key={r.slug} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm last:border-0">
                    <span className="min-w-0 truncate text-ink">{r.name}</span>
                    <FitBadge band={r.band} />
                  </li>
                ))}
              </ul>
              {model.targets.rows.length > TARGET_ROWS_SHOWN && (
                <p className="mt-2 text-sm text-stone">And {model.targets.rows.length - TARGET_ROWS_SHOWN} more.</p>
              )}
              <div className="mt-auto pt-3">
                {model.targets.judging?.isProjected ? (
                  <ProjectionNote utr={model.targets.judging} who={child} />
                ) : model.targets.judging ? (
                  <DataNote>
                    Bands use {child}&rsquo;s UTR today:{" "}
                    <span className="font-mono text-ink">{model.targets.judging.value.toFixed(2)}</span>.
                  </DataNote>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState className="mt-4" title="No target schools yet." description={`${child} saves them from Schools.`} />
          )}
        </section>

        <section className={L.GRID_CARD} aria-labelledby="week-title">
          <h2 id="week-title" className="text-lg font-semibold text-ink">
            For you this week
          </h2>
          {model.actions.length ? (
            <ul className="mt-3 flex flex-col">
              {model.actions.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm last:border-0">
                  <span className="min-w-0 text-ink">{a.text}</span>
                  <ActionButton action={a} preview={preview} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState className="mt-4" title="Nothing needs you this week." description={`New results, spend and events for ${child} show up here.`} />
          )}
        </section>
      </div>
    </>
  );
}

function KpiCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={L.KPI_CARD}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone">{label}</p>
      {children}
    </div>
  );
}

function StatusChip({ tone, children }: { tone: "near" | "over"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-pill border px-2 py-0.5 text-xs font-semibold",
        tone === "over"
          ? "border-error/30 bg-error-bg text-error-strong"
          : "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]"
      )}
    >
      {children}
    </span>
  );
}

/** One budget line: label, mono amounts, a bar, and — whenever the colour
 *  means something — a chip that says it in words. */
function BudgetRow({ bar, strong = false }: { bar: BudgetBar; strong?: boolean }) {
  const fill = bar.status === "over" ? "bg-error" : bar.status === "near" ? "bg-gold" : "bg-grass";
  return (
    <div className={cn("py-2", strong && "mt-3")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className={cn("flex items-center gap-2", strong ? "font-semibold text-ink" : "text-ink")}>
          {bar.label}
          {bar.status === "near" && <StatusChip tone="near">Near limit</StatusChip>}
          {bar.status === "over" && <StatusChip tone="over">Over by {formatMoney(bar.overBy ?? 0)}</StatusChip>}
        </span>
        <span className="font-mono text-stone">
          <span className="text-ink">{formatMoney(bar.spent)}</span>
          {bar.limit != null && <> / {formatMoney(bar.limit)}</>}
        </span>
      </div>
      <div
        className={cn("mt-1.5 w-full overflow-hidden rounded-pill bg-line", strong ? "h-2.5" : "h-1.5")}
        role="presentation"
      >
        <div className={cn("h-full rounded-pill", fill)} style={{ width: `${bar.widthPct}%` }} />
      </div>
    </div>
  );
}

function ActionButton({ action, preview }: { action: WeekAction; preview: boolean }) {
  if (preview) return <InertButton>{action.label}</InertButton>;
  return (
    <Link
      href={action.href}
      className={cn(seededButtonVariants({ variant: action.primary ? "primary" : "secondary" }), "min-h-10 shrink-0 px-4")}
    >
      {action.label}
    </Link>
  );
}

/** What a button looks like in the Example preview: the secondary style,
 *  not focusable, not clickable. Never green — the paywall's "Choose
 *  Family" is that screen's one primary. */
function InertButton({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className={cn(seededButtonVariants({ variant: "secondary" }), "pointer-events-none min-h-10 shrink-0 px-4")}>
      {children}
    </span>
  );
}
