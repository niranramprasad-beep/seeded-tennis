import { NextResponse } from "next/server";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";
import { WHOP_PLAN_IDS } from "@/lib/whop";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TIER_RANK, type SubscriptionTier } from "@/lib/types";

// The only place subscription_tier is ever written for Whop customers —
// Whop is the source of truth for who's paying, not anything the client
// can set directly. Every membership event below carries the same
// `metadata.supabase_user_id` set at checkout, so no separate customer-id
// lookup table is needed the way Stripe's webhook requires.

const ACCESS_GRANTING_STATUSES = new Set(["active", "trialing", "completed"]);

function tierForPlanId(planId: string | undefined): SubscriptionTier {
  if (planId && planId === WHOP_PLAN_IDS.family) return "family";
  if (planId && planId === WHOP_PLAN_IDS.player) return "player";
  return "free";
}

interface MembershipEvent {
  type: string;
  data: {
    id: string;
    status: string;
    plan_id: string;
    metadata: Record<string, unknown>;
  };
}

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET;
  if (!admin || !webhookSecret) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
  }

  // unwrapWebhook needs the exact, unparsed bytes to verify the signature —
  // reading the body as JSON first would change them and fail verification.
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  let event: MembershipEvent;
  try {
    event = unwrapWebhook<MembershipEvent>(payload, { headers, key: webhookSecret });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }
    throw err;
  }

  if (
    event.type === "membership.activated" ||
    event.type === "membership.updated" ||
    event.type === "membership.deactivated"
  ) {
    const membership = event.data;
    const supabaseUserId = membership.metadata?.supabase_user_id;
    if (typeof supabaseUserId === "string") {
      if (ACCESS_GRANTING_STATUSES.has(membership.status)) {
        const newTier = tierForPlanId(membership.plan_id);

        // A stale or duplicate event for an old membership must never
        // clobber a currently active, higher (or equal) tier — confirmed
        // live: a real account ended up downgraded from Family to Player
        // with no corresponding downgrade on the Whop side, consistent
        // with an out-of-order/replayed event for a superseded membership
        // overwriting the correct tier. Only apply this event if it's an
        // update to the SAME membership already on record, there's no
        // membership on record yet, or it's a genuine upgrade.
        const { data: current } = await admin
          .from("profiles")
          .select("subscription_tier, whop_membership_id")
          .eq("id", supabaseUserId)
          .maybeSingle();

        const isSameMembership = current?.whop_membership_id === membership.id;
        const currentTier = (current?.subscription_tier as SubscriptionTier | undefined) ?? "free";
        const isUpgradeOrFirstTime =
          !current?.whop_membership_id || TIER_RANK[newTier] >= TIER_RANK[currentTier];

        if (isSameMembership || isUpgradeOrFirstTime) {
          await admin
            .from("profiles")
            .update({
              subscription_tier: newTier,
              whop_membership_id: membership.id,
            })
            .eq("id", supabaseUserId);
        }
      } else {
        // Only downgrade if THIS is the membership currently on record for
        // the user. A user can have more than one membership over time
        // (e.g. they tried Family, canceled it, and are still on an active
        // Player plan) — an old, already-superseded membership canceling
        // must never stomp a different, still-active one.
        await admin
          .from("profiles")
          .update({ subscription_tier: "free" })
          .eq("id", supabaseUserId)
          .eq("whop_membership_id", membership.id);
      }
    }
  }

  return NextResponse.json({ received: true });
}
