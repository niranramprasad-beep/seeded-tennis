import { notFound } from "next/navigation";
import { BillingPreview, type BillingPreviewState } from "@/components/dev/billing-preview";
import { describePaidPlan } from "@/lib/billing-plan";
import { billingViewState, type BillingMembership } from "@/lib/billing-view";
import type { WhopPlanIds } from "@/lib/whop";

// Every /settings/billing state, side by side, without signing in or
// calling Whop. The plan descriptions are built here, on the server, by the
// same describePaidPlan() the real route uses — with stand-in plan ids,
// because what matters is which of the six slots an id is in.
const IDS: WhopPlanIds = {
  playerMonthly: "plan_preview_pm",
  playerYearly: "plan_preview_py",
  familyMonthly: "plan_preview_fm",
  familyYearly: "plan_preview_fy",
  legacyPlayer: "plan_preview_legacy_p",
  legacyFamily: "plan_preview_legacy_f",
};

const ACTIVE: BillingMembership = {
  status: "active",
  // Date-only on purpose: the preview shows the same calendar day in every
  // timezone (a timestamp would be a different day for some viewers).
  currentPeriodEnd: "2026-12-14",
  cancelAtPeriodEnd: false,
};

function found(planId: string | null, membership: BillingMembership = ACTIVE, profileTier?: "player" | "family") {
  return {
    kind: "found" as const,
    plan: describePaidPlan(planId, membership, { ids: IDS, profileTier }),
    manageUrl: null,
  };
}

const PAYER = "Wei Chen";

function states(): BillingPreviewState[] {
  return [
    { id: "free", label: "Free", view: billingViewState({ tier: "free", lookup: undefined, viewerName: PAYER }) },
    { id: "player-monthly", label: "Player monthly", view: billingViewState({ tier: "player", lookup: found(IDS.playerMonthly!), viewerName: PAYER }) },
    { id: "player-yearly", label: "Player yearly", view: billingViewState({ tier: "player", lookup: found(IDS.playerYearly!, { ...ACTIVE, currentPeriodEnd: "2027-09-14" }), viewerName: PAYER }) },
    { id: "family", label: "Family", view: billingViewState({ tier: "family", lookup: found(IDS.familyMonthly!), viewerName: PAYER }) },
    { id: "legacy-player", label: "Legacy $19", view: billingViewState({ tier: "player", lookup: found(IDS.legacyPlayer!), viewerName: PAYER }) },
    { id: "unknown-plan", label: "Unknown plan id", view: billingViewState({ tier: "family", lookup: found("plan_not_configured", ACTIVE, "family"), viewerName: PAYER }) },
    { id: "canceling", label: "Cancelled, active until", view: billingViewState({ tier: "player", lookup: found(IDS.playerMonthly!, { ...ACTIVE, cancelAtPeriodEnd: true }), viewerName: PAYER }) },
    { id: "past-due", label: "Payment due", view: billingViewState({ tier: "player", lookup: found(IDS.playerMonthly!, { ...ACTIVE, status: "past_due" }), viewerName: PAYER }) },
    { id: "unreachable", label: "Whop failing", view: billingViewState({ tier: "family", lookup: { kind: "unreachable" }, viewerName: PAYER }) },
    { id: "not-payer", label: "Viewer ≠ payer", view: billingViewState({ tier: "family", lookup: { kind: "none" }, viewerName: "Maya Chen" }) },
    { id: "not-payer-named", label: "Viewer ≠ payer (name known)", view: billingViewState({ tier: "family", lookup: { kind: "none" }, viewerName: "Maya Chen", otherPayerFirstName: "Wei" }) },
  ];
}

export default function DevBillingPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <BillingPreview states={states()} />;
}
