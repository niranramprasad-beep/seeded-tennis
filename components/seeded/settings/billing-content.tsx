import Link from "next/link";
import type { ReactNode } from "react";
import { FAMILY_PLAN_MAX_PARENTS, FAMILY_PLAN_MAX_PLAYERS, type SubscriptionTier } from "@/lib/types";
import type { FamilyMember } from "@/lib/db/family";
import { familyCapCounts } from "@/lib/family-settings";
import {
  NOT_PAYER_SELF_NOTE,
  SEE_PRICE_ON_WHOP,
  WHOP_UNREACHABLE_NOTE,
  billingDate,
  intervalLabel,
  notPayerNote,
  whopHandoffNote,
  type BillingViewState,
  type PaidPlanDescription,
} from "@/lib/billing-view";
import { DataNote } from "@/components/seeded/ui/data-note";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";

// /settings/billing's cards, one layout per BillingViewState (lib/
// billing-view.ts). Rendered by SeededBillingView with live data and by
// /dev/billing-preview with every state side by side.
//
// What this page never does, each learned from a real account:
//
// - Show today's price table as what somebody pays. The price comes from the
//   membership's own plan id (describePaidPlan); the old $19/$39 plans show
//   $19/$39, and an unrecognised plan shows "See your price on Whop".
// - Send a non-payer to Whop. The membership lives on the BUYER's Whop
//   account, and anyone else gets Whop's "You do not have access to this
//   page on this account. Press continue to switch accounts."
// - Guess who pays. "Billed to {the family's parent}" used to be inferred
//   from the roster; nothing records that the parent is the one paying.
// - Open Whop in a new tab. Every Whop link is the same tab, after one calm
//   sentence saying where they are going and as whom to sign in.
// - Claim "Unlimited tournament fit checks". The checker is free and
//   ungated for everyone (pricing-data's ALWAYS_FREE_FEATURES), so it was
//   never a paid perk.

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const secondaryLink = cn(seededButtonVariants({ variant: "secondary" }), FOCUS);

function Chip({ tone, children }: { tone: "active" | "neutral" | "warning"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        tone === "active" && "border-grass-100 bg-grass-50 text-grass",
        tone === "neutral" && "border-line bg-card text-stone",
        tone === "warning" &&
          "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]"
      )}
    >
      {children}
    </span>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-cream/50 p-4">
      {/* Numbers in JetBrains Mono; a word like "Unlimited" stays in Inter. */}
      <p className={cn("text-xl font-semibold text-ink", /^\d/.test(value) && "font-mono tabular-nums")}>{value}</p>
      <p className="mt-0.5 text-sm text-stone">{label}</p>
    </div>
  );
}

function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** A link to Whop. Same tab on purpose — see the file comment. */
function WhopLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} className={cn(secondaryLink, className)}>
      {children}
    </a>
  );
}

const STATUS_CHIP: Record<PaidPlanDescription["status"], { label: string; tone: "active" | "neutral" | "warning" }> = {
  active: { label: "Active", tone: "active" },
  canceling: { label: "Cancelled", tone: "neutral" },
  "past-due": { label: "Payment due", tone: "warning" },
  ended: { label: "Ended", tone: "neutral" },
};

function PriceLine({ plan }: { plan: PaidPlanDescription }) {
  if (plan.priceUsd == null || !plan.interval) {
    return <span className="font-medium">{SEE_PRICE_ON_WHOP}</span>;
  }
  return (
    <span className="font-medium">
      <span className="font-mono tabular-nums">${plan.priceUsd}</span>{" "}
      {plan.interval === "yearly" ? "a year" : "a month"}
      {plan.legacy && <span className="font-normal text-stone">, the price when you joined</span>}
    </span>
  );
}

function PeriodLine({ plan }: { plan: PaidPlanDescription }) {
  const date = billingDate(plan.periodEnd);
  switch (plan.status) {
    case "active":
      return date ? (
        <>
          Renews <span className="font-medium">{date}</span>
        </>
      ) : null;
    case "canceling":
      return date ? (
        <>
          Active until <span className="font-medium">{date}</span>, then Free
        </>
      ) : (
        <>Active until the end of this billing period, then Free</>
      );
    case "past-due":
      return <>The last payment didn&apos;t go through. Update your card on Whop to keep your plan.</>;
    case "ended":
      return date ? (
        <>
          Ended <span className="font-medium">{date}</span>
        </>
      ) : (
        <>This plan has ended.</>
      );
  }
}

function IncludedCard({ tier, familyMembers }: { tier: SubscriptionTier; familyMembers: FamilyMember[] }) {
  // Only what the database actually gates: FREE_TIER_TARGET_SCHOOL_LIMIT
  // (migrations 024/040) is the paid difference in target schools, and the
  // seats are the real roster from family_members() (approved members
  // only), out of 045's caps — the same numbers and the same count as
  // Settings → Family (lib/family-settings.ts).
  //
  // This used to show `players || 1` and a parent tile that could only ever
  // say 0 or 1: an empty roster read as one player, and a second parent was
  // never counted.
  if (tier === "family") {
    const counts = familyCapCounts(
      familyMembers.map((m) => ({ userId: m.id, role: m.role, status: "approved" as const }))
    );
    return (
      <CardShell title="What's included">
        <div className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
          <Tile
            value={`${counts.players} of ${FAMILY_PLAN_MAX_PLAYERS}`}
            label="player seats used"
          />
          <Tile
            value={`${counts.parents} of ${FAMILY_PLAN_MAX_PARENTS}`}
            label="parent seats used"
          />
          <Tile value="Unlimited" label="target schools" />
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell title="What's included">
      <div className="mt-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
        <Tile value="1" label="player profile" />
        <Tile value="Unlimited" label="target schools" />
      </div>
    </CardShell>
  );
}

export function BillingContent({
  view,
  familyMembers,
  onRetry,
  retrying = false,
}: {
  view: BillingViewState;
  familyMembers: FamilyMember[];
  onRetry?: () => void;
  retrying?: boolean;
}) {
  if (view.kind === "free") {
    return (
      <section className="rounded-xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">You&apos;re on Free</h2>
        <p className="mt-2 text-sm text-stone">
          Paid plans add the weekly tools: unlimited schools, coach outreach and a parent view.
        </p>
        <div className="mt-4">
          {/* The one green button on this screen. */}
          <Link href="/pricing" className={cn(seededButtonVariants({ variant: "primary" }), FOCUS)}>
            See plans
          </Link>
        </div>
      </section>
    );
  }

  if (view.kind === "loading") {
    // Same boxes as the plan card it becomes (rule 6).
    return (
      <section className="rounded-xl border border-line bg-card p-6" aria-busy="true">
        <h2 className="text-lg font-semibold text-ink">Your plan</h2>
        <div className="mt-2 h-5 w-48 animate-pulse rounded bg-line/50 motion-reduce:animate-none" aria-hidden />
        <div className="mt-3 h-5 w-72 animate-pulse rounded bg-line/40 motion-reduce:animate-none" aria-hidden />
        <div className="mt-4 h-11 w-32 animate-pulse rounded-lg bg-line/40 motion-reduce:animate-none" aria-hidden />
      </section>
    );
  }

  if (view.kind === "unreachable") {
    return (
      <>
        <section className="rounded-xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">{view.tierName} plan</h2>
          <p role="status" className="mt-2 text-sm text-stone">
            {WHOP_UNREACHABLE_NOTE}
          </p>
          {onRetry && (
            <div className="mt-4">
              <SeededButton type="button" variant="secondary" onClick={onRetry} loading={retrying}>
                Try again
              </SeededButton>
            </div>
          )}
        </section>
        <IncludedCard tier={view.tier} familyMembers={familyMembers} />
      </>
    );
  }

  if (view.kind === "not-payer") {
    return (
      <>
        <section className="rounded-xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">{view.tierName} plan</h2>
          <p className="mt-2 text-sm text-stone">{notPayerNote(view.payerFirstName)}</p>
          <p className="mt-1 text-sm text-stone">{NOT_PAYER_SELF_NOTE}</p>
        </section>
        <IncludedCard tier={view.tier} familyMembers={familyMembers} />
      </>
    );
  }

  // view.kind === "payer"
  const { plan, portalUrl } = view;
  const chip = STATUS_CHIP[plan.status];
  const interval = intervalLabel(plan.interval);
  // A failed payment leaves the period end unknown in practice (Whop retries
  // and may end it early), so the cancel copy does not promise that date.
  const endDate = plan.status === "past-due" ? null : billingDate(plan.periodEnd);
  const live = plan.status !== "ended";

  return (
    <>
      <section className="rounded-xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{plan.tierName} plan</h2>
          <Chip tone={chip.tone}>{chip.label}</Chip>
          {interval && <Chip tone="neutral">{interval}</Chip>}
        </div>
        <p className="mt-2 text-sm text-ink">
          <PriceLine plan={plan} />
        </p>
        <p className="mt-1 text-sm text-stone">
          <PeriodLine plan={plan} />
        </p>
        <DataNote showLink={false} className="mt-4">
          {whopHandoffNote(view.payerFirstName)}
        </DataNote>
        <div className="mt-4 flex flex-wrap gap-3">
          <WhopLink href={portalUrl}>Change plan</WhopLink>
        </div>
      </section>

      <IncludedCard tier={plan.tier} familyMembers={familyMembers} />

      <CardShell title="Payment method">
        <p className="mt-1 text-sm text-stone">
          Your card is on file with Whop. Seeded never sees or stores your card number.
        </p>
        <div className="mt-4">
          <WhopLink href={portalUrl}>Update card</WhopLink>
        </div>
      </CardShell>

      <CardShell title="Invoices">
        <p className="mt-1 text-sm text-stone">Your receipts and billing history are on Whop.</p>
        <div className="mt-4">
          <WhopLink href={portalUrl}>Open billing portal</WhopLink>
        </div>
      </CardShell>

      {live && (
        <CardShell title="Cancel plan">
          <p className="mt-1 text-sm text-stone">
            {plan.status === "canceling"
              ? `Your plan is already cancelled. It stays active until ${endDate ?? "the end of this billing period"}, then moves to Free. Your schools, notes and history stay saved.`
              : `You keep ${plan.tierName} until ${endDate ?? "the end of this billing period"}, then move to Free. Your schools, notes and history stay saved.`}
          </p>
          <div className="mt-4">
            <WhopLink href={portalUrl} className="border-error/50 text-error hover:bg-error-bg">
              {plan.status === "canceling" ? "Manage cancellation" : "Cancel plan"}
            </WhopLink>
          </div>
        </CardShell>
      )}
    </>
  );
}
