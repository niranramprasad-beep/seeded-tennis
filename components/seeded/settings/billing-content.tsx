import type { ReactNode } from "react";
import { formatTierPrice, type Player, type SubscriptionTier } from "@/lib/types";
import type { FamilyMember } from "@/lib/db/family";
import type { MembershipSnapshot } from "@/lib/db/settings";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

// Whop's own hosted member portal — the SAME URL already shipped in
// components/pricing/pricing-view.tsx's manageBilling() (not imported from
// there since that file is explicitly out of scope for this task; kept
// identical on purpose so there's exactly one real "manage your plan"
// destination across the app). Every mutation-shaped action on this page
// (change plan, switch billing period, update card, cancel) deep-links
// here instead of being built as in-app payment UI — this app never
// changes or cancels a subscription itself. When a live membership lookup
// succeeds (see lib/db/settings.ts), its manage_url is preferred — a
// link scoped to that exact membership — and this is the fallback.
const FALLBACK_PORTAL_URL = "https://whop.com/@me/settings/memberships/";

// Was a third hand-kept copy of the prices, mirroring two others by comment
// and discipline alone. They are all one table now (lib/types'
// TIER_PRICE_USD), because the 2026-11-14 price change proved the comment
// was not enough: Player moved to $12 and Family to $19, and the old copies
// would each have gone stale in a different direction.
//
// Monthly, because that is what this tab shows for an existing subscriber
// and we do not store which interval they bought. The renewal date from
// /api/whop/membership is what actually tells them when they next pay.
function tierPriceDisplay(tier: SubscriptionTier): string {
  return tier === "free" ? "$0" : formatTierPrice(tier, "monthly");
}

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player",
  family: "Family",
};

function Chip({
  tone,
  children,
}: {
  tone: "active" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        tone === "active" ? "border-grass-100 bg-grass-50 text-grass" : "border-line bg-card text-stone"
      )}
    >
      {children}
    </span>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-cream/50 p-4">
      <p className="text-xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-sm text-stone">{label}</p>
    </div>
  );
}

function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

export function BillingContent({
  player,
  tier,
  familyMembers,
  membership,
}: {
  player: Player;
  tier: SubscriptionTier;
  familyMembers: FamilyMember[];
  membership: MembershipSnapshot | null;
}) {
  const isPaid = tier !== "free";
  const portalUrl = membership?.manageUrl || FALLBACK_PORTAL_URL;
  const tierLabel = TIER_LABEL[tier];

  // "Billed to" — real family data (lib/db/family.ts (formerly lib/supabase/features.ts)'s
  // loadFamilyMembers(), already used by the parent dashboard), not the
  // mockup's invented "Players under 18 can't be the account holder" rule:
  // nothing in this app's actual signup/checkout flow (lib/auth.ts,
  // components/pricing/pricing-view.tsx's choose()) restricts who can
  // start a Whop checkout, so that claim isn't true here and is dropped.
  const parentMember = familyMembers.find((m) => m.role === "parent");
  const billedToName = player.role === "parent" ? player.name : parentMember?.name ?? player.name;
  const billedToSuffix =
    player.role === "parent" ? "(you)" : parentMember ? "(parent)" : null;

  const renewalDate = membership?.currentPeriodEnd ? formatDate(membership.currentPeriodEnd) : null;
  const cancelsAtPeriodEnd = Boolean(membership?.cancelAtPeriodEnd);

  const playerSeatCount = familyMembers.filter((m) => m.role === "player").length || 1;

  return (
    <>
      <div className="rounded-xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{tierLabel} plan</h2>
              {isPaid && <Chip tone="active">{cancelsAtPeriodEnd ? "Canceling" : "Active"}</Chip>}
              {isPaid && <Chip tone="neutral">Monthly</Chip>}
            </div>
            <p className="mt-2 text-sm text-ink">
              {isPaid ? (
                <>
                  <span className="font-medium">{tierPriceDisplay(tier)} a month</span>
                  {renewalDate && (
                    <>
                      {" "}
                      · {cancelsAtPeriodEnd ? "ends" : "renews"}{" "}
                      <span className="font-medium">{renewalDate}</span>
                    </>
                  )}
                </>
              ) : (
                "You're on the Free plan — browsing schools only, no roadmap or coach outreach yet."
              )}
            </p>
            {isPaid && (
              <p className="mt-1 text-sm text-stone">
                Billed to {billedToName}
                {billedToSuffix ? ` ${billedToSuffix}` : ""}.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {isPaid ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
              >
                Change plan
              </a>
            ) : (
              <a
                href="/pricing"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-grass px-[18px] text-[15px] font-semibold text-on-primary transition-colors hover:bg-grass-600"
              >
                View plans
              </a>
            )}
          </div>
        </div>
      </div>

      {isPaid && (
        <CardShell title="What's included">
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tier === "family" ? (
              <>
                <Tile value={String(playerSeatCount)} label={playerSeatCount === 1 ? "player seat used" : "player seats used"} />
                <Tile
                  value={parentMember ? "1" : "0"}
                  label={parentMember ? `parent seat · ${parentMember.name}` : "parent seat · not linked yet"}
                />
                <Tile value="Unlimited" label="tournament fit checks" />
              </>
            ) : (
              <>
                <Tile value="1" label="player profile" />
                <Tile value="Unlimited" label="tournament fit checks" />
              </>
            )}
          </div>
        </CardShell>
      )}

      {isPaid && (
        <CardShell title="Payment method">
          <p className="mt-1 text-sm text-stone">
            Your card is on file with Whop, our billing provider. Payments are processed securely, and
            Seeded never sees or stores your full card number — manage or update your saved card
            directly in your billing portal.
          </p>
          <div className="mt-4">
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-input bg-card px-[18px] text-[15px] font-semibold text-ink transition-colors hover:bg-subtle-hover"
            >
              Update card
            </a>
          </div>
        </CardShell>
      )}

      {isPaid && (
        <CardShell title="Invoices">
          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-3 gap-4 border-b border-line bg-cream/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-light">
              <span>Date</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="p-4">
              <p className="text-sm text-ink">
                <strong>No invoice history to show here yet.</strong>{" "}
                <span className="text-stone">
                  Your full billing history and receipts live in your Whop billing portal.
                </span>{" "}
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-grass"
                >
                  Open billing portal
                </a>
              </p>
            </div>
          </div>
        </CardShell>
      )}

      {isPaid && (
        <CardShell title="Cancel plan">
          <p className="mt-1 text-sm text-stone">
            {cancelsAtPeriodEnd
              ? `Your plan is already set to cancel${renewalDate ? ` on ${renewalDate}` : ""}. You'll move to Free automatically — your schools, notes and history stay saved.`
              : `You'll keep ${tierLabel} features until${renewalDate ? ` ${renewalDate}` : " your current billing period ends"}, then move to Free. Your schools, notes and history stay saved.`}
          </p>
          <div className="mt-4">
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-error/50 bg-card px-[18px] text-[15px] font-semibold text-error transition-colors hover:bg-error-bg"
            >
              {cancelsAtPeriodEnd ? "Manage cancellation" : "Cancel plan"}
            </a>
          </div>
        </CardShell>
      )}
    </>
  );
}
