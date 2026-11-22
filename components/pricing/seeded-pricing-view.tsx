"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import {
  FAMILY_PLAN_SCOPE_LABEL,
  FREE_TIER_TARGET_SCHOOL_LIMIT,
  type BillingInterval,
} from "@/lib/types";
import { SUPPORT_EMAIL } from "@/lib/config/contact";
import type { CatalogCounts } from "@/lib/db/schools";
import { SeededButton } from "@/components/seeded/ui/button";
import { cn } from "@/lib/utils";
import { usePlanCheckout } from "./use-plan-checkout";
import { planCards, priceBlockFor, yearlyToggleLabel } from "./pricing-data";
import { CompareTable } from "./compare-table";

// /pricing, Seeded design — docs/DESIGN_MOCKUP_SPEC_V2.md "Board 19".
// Every price, count and limit on this page is derived (pricing-data.ts);
// every sentence about billing, cancelling and families was checked against
// the code that does it — see the notes beside each one.

const sectionTitle =
  "seeded-section-head text-balance text-center font-seeded text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]";

export function SeededPricingView({ counts }: { counts: CatalogCounts }) {
  // Yearly first (Board 19).
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const plans = useMemo(() => planCards(counts), [counts]);
  const { tier, errorFor, clearError, busy, choose, manageBilling, buttonState } = usePlanCheckout(interval);

  return (
    <div className="mx-auto max-w-content container-px py-16 md:py-24">
      <div className="seeded-stack">
        {/* ---------------------------------------------------- hero + plans */}
        <section aria-labelledby="pricing-title">
          <div className="mx-auto max-w-[720px] text-center">
            <h1
              id="pricing-title"
              className="text-balance font-seeded text-[36px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[48px]"
            >
              <span className="block">Your first fit report is free.</span>
              <span className="block">Pay when you want a plan.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[600px] text-pretty text-lg leading-relaxed text-stone">
              Paid plans add unlimited schools, coach outreach and a parent view.
            </p>
            {tier !== "free" && (
              <button
                type="button"
                onClick={manageBilling}
                disabled={busy}
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-grass underline-offset-4 hover:underline"
              >
                Your plan and billing
              </button>
            )}
          </div>

          {/* A real control: the interval is sent to /api/whop/checkout and
              decides which Whop plan is charged. */}
          <div className="mt-10 flex justify-center">
            <div
              role="group"
              aria-label="Billing period"
              className="inline-flex rounded-pill border border-line bg-cream p-1"
            >
              {(["yearly", "monthly"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={interval === option}
                  onClick={() => {
                    setInterval(option);
                    // The message was about the other prices.
                    clearError();
                  }}
                  className={cn(
                    "min-h-11 rounded-pill border px-5 text-sm font-semibold transition-colors",
                    interval === option
                      ? "border-line bg-card text-ink shadow-seeded-1"
                      : "border-transparent text-stone hover:text-ink"
                  )}
                >
                  {option === "yearly" ? yearlyToggleLabel() : "Monthly"}
                </button>
              ))}
            </div>
          </div>

          {/* Three cards. At lg each card is a subgrid over the parent's four
              rows — [name][price, 92px][button][features] — so the buttons
              and the first feature line up across all three whatever the
              taglines do. Below lg they stack, each its own 4-row grid. */}
          <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:grid-rows-[auto_minmax(92px,auto)_auto_1fr]">
            {plans.map((plan) => {
              const btn = buttonState(plan.tier, plan.name);
              const price = priceBlockFor(plan.tier, interval);
              const cardError = errorFor(plan.tier);
              return (
                <article
                  key={plan.tier}
                  aria-labelledby={`plan-${plan.tier}`}
                  className={cn(
                    "relative grid grid-rows-[auto_minmax(92px,auto)_auto_1fr] gap-y-0 rounded-xl bg-card lg:row-span-4 lg:grid-rows-subgrid",
                    // 2px border on Player; 1px less padding keeps every
                    // card's content box at the same offset.
                    plan.recommended ? "border-2 border-grass p-[27px]" : "border border-line p-7"
                  )}
                >
                  {plan.recommended && !btn.disabled && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-grass px-3 py-1 text-xs font-semibold text-on-primary">
                      Recommended
                    </span>
                  )}

                  <div className="pb-5">
                    <h2 id={`plan-${plan.tier}`} className="font-seeded text-xl font-semibold text-ink">
                      {plan.name}
                    </h2>
                    <p className="mt-1 text-[15px] text-stone">{plan.tagline}</p>
                  </div>

                  <div className="min-h-[92px]">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      {price.wasAmount && (
                        <s className="font-mono text-lg text-stone-light tabular-nums">
                          <span className="sr-only">12 months at the monthly price: </span>
                          {price.wasAmount}
                        </s>
                      )}
                      <span className="font-mono text-[40px] font-semibold leading-none tracking-tight text-ink tabular-nums">
                        {price.amount}
                      </span>
                      <span className="text-sm text-stone">{price.cadence}</span>
                    </p>
                    <p className="mt-2 text-sm text-stone">{price.note}</p>
                  </div>

                  <div>
                    <SeededButton
                      variant={plan.recommended ? "primary" : "secondary"}
                      className="w-full"
                      // An "Included in your family's plan" button stays
                      // focusable (aria-disabled) so its reason is read out;
                      // the click does nothing.
                      onClick={() => {
                        if (!btn.ariaDisabled) void choose(plan.tier);
                      }}
                      disabled={btn.disabled}
                      aria-disabled={btn.ariaDisabled || undefined}
                      loading={btn.loading}
                      aria-describedby={cardError ? `checkout-error-${plan.tier}` : undefined}
                    >
                      {btn.label}
                    </SeededButton>
                    {/* Under the button that was clicked. On a Vercel
                        Preview: "Checkout is off on preview builds…"
                        (lib/checkout-messages.ts). */}
                    {cardError && (
                      <p
                        id={`checkout-error-${plan.tier}`}
                        role="alert"
                        className="mt-3 rounded-lg bg-error-bg px-3 py-2 text-sm text-error"
                      >
                        {cardError}
                      </p>
                    )}
                  </div>

                  <ul className="mt-6 space-y-3 border-t border-line pt-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[15px] leading-snug text-ink">
                        <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-grass" strokeWidth={2.5} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          {/* Both lines checked against the code:
              - Checkout: /api/whop/checkout returns a Whop checkout URL;
                cancelling is on Whop's own memberships page (manageBilling,
                and /settings/billing's portal link). "Two clicks" stays
                banned (copy-honesty) — we don't own Whop's UI.
              - Under-13: migration 030 makes an under-13 account inert until
                an adult in its family consents. Nothing checks who PAYS, so
                "billed to a parent" stays banned too. */}
          <div className="mt-8 space-y-1 text-center text-sm text-stone">
            <p>Checkout is handled by Whop. Cancel any time from your Whop account.</p>
            <p>Players under 13 need a parent or guardian to approve the account.</p>
          </div>
        </section>

        {/* ------------------------------------------ what stays free, always */}
        <section aria-labelledby="free-always">
          <h2 id="free-always" className={sectionTitle}>
            What stays free, always
          </h2>
          <div className="seeded-card-row md:grid-cols-3">
            <FreeCard title="Every school page">
              Open any of the {counts.total} programs and see where it sits. No account needed.
            </FreeCard>
            <FreeCard title="Your fit report">
              Answer a few questions and see which schools are Likely, Target, Reach or Out of
              range. No card needed.
            </FreeCard>
            <FreeCard
              title="How we calculate fit"
              action={
                <Link
                  href="/methodology"
                  className="inline-flex min-h-11 items-center text-[15px] font-semibold text-grass underline-offset-4 hover:underline"
                >
                  Read it
                </Link>
              }
            >
              The same math runs on every plan, and we show how it works.
            </FreeCard>
          </div>
        </section>

        {/* ----------------------------------------------------- compare table */}
        <section aria-labelledby="compare-heading">
          <h2 id="compare-heading" className={sectionTitle}>
            Compare every feature
          </h2>
          <CompareTable />
        </section>

        {/* -------------------------------------------------------------- FAQ */}
        <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl">
          <h2 id="faq-heading" className={sectionTitle}>
            Questions
          </h2>
          <div className="divide-y divide-line rounded-card border border-line bg-card">
            {/* Seeded design only: /onboarding renders the fit report before
                any session check (seeded/onboarding/onboarding-page-switch.tsx). */}
            <Faq question="Is the fit report really free?">
              Yes. Answer the questions and you see your fit report, with no card and no account.
              Make a free account to save it and track up to {FREE_TIER_TARGET_SCHOOL_LIMIT} target
              schools.
            </Faq>
            {/* lib/whop-sync.ts: an access-granting status (active, trialing,
                completed) keeps the tier; any other status sets
                subscription_tier to "free" and nothing else — no row is
                deleted. Whop keeps a cancelled membership active to the end
                of the paid period (cancel_at_period_end, which
                /settings/billing already tells the user). Migrations
                024 + 040: a Free account over the limit keeps its list and
                can prune; it can never grow past the limit. */}
            <Faq question="What happens if I cancel?">
              Cancel from your Whop account. Whop keeps your plan running to the end of the period
              you already paid for, then your account moves back to Free. Nothing you saved is
              deleted. You keep every school you track, even past {FREE_TIER_TARGET_SCHOOL_LIMIT}, but
              on Free the list can&apos;t grow past {FREE_TIER_TARGET_SCHOOL_LIMIT}. Outreach and your
              roadmap stay saved and come back if you pick a paid plan again.
            </Faq>
            {/* Mechanics from lib/route-access.ts (only a parent account
                opens /family), migration 026 (joiners land pending until
                approved), CLAUDE.md's parent-write rule, and PR B's gate:
                /family, /family/budget and /family/weekly-reports show the
                Family paywall unless my_family_has_tier('family') — a plan
                held by a member whose HOME family it is (045; lib/db/family-plan.ts). */}
            <Faq question="Does a parent need the Family plan?">
              Yes, for the parent tools. The parent dashboard, the season budget and the weekly family
              report need the Family plan, and the player or a parent can buy it, from an account
              whose own family this is. A parent uses their own parent account and joins with the family code, and a
              family member approves them. The parent can edit the budget and send notes; everything
              else is read-only.
            </Faq>
            {/* Migration 045 (docs/DECISIONS.md, 2026-11-19): the plan unlocks
                the family the paying account belongs to (home_family_code),
                and join_family / approve_family_join refuse past the caps. */}
            <Faq question="How many people does one Family plan cover?">
              {FAMILY_PLAN_SCOPE_LABEL}. The plan unlocks the paying account&apos;s own family, and
              only that one, even if the account also belongs to another family. If the paying
              account is removed from the family, the family goes back to Free unless someone else in
              it pays; nothing is deleted. A family that&apos;s full can&apos;t take another player or
              parent. Contact {SUPPORT_EMAIL} if you need more.
            </Faq>
            <Faq question="Where do the numbers come from?">
              Your UTR is the number you enter. Team levels are our estimates, not official numbers.{" "}
              <Link
                href="/methodology"
                className="font-semibold text-grass underline-offset-4 hover:underline"
              >
                How we calculate fit
              </Link>{" "}
              explains both.
            </Faq>
          </div>
        </section>
      </div>
    </div>
  );
}

function FreeCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-card p-6">
      <h3 className="font-seeded text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-stone">{children}</p>
      {action && <div className="mt-auto pt-2">{action}</div>}
    </div>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group px-5 sm:px-6">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
        <h3 className="text-[17px] font-semibold text-ink">{question}</h3>
        <ChevronDown
          aria-hidden
          className="h-5 w-5 shrink-0 text-stone transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <p className="pb-5 text-[15px] leading-relaxed text-stone">{children}</p>
    </details>
  );
}
