import { NextResponse } from "next/server";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";
import { WHOP_PLAN_IDS } from "@/lib/whop";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SubscriptionTier } from "@/lib/types";

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
      const tier = ACCESS_GRANTING_STATUSES.has(membership.status)
        ? tierForPlanId(membership.plan_id)
        : "free";
      await admin
        .from("profiles")
        .update({ subscription_tier: tier, whop_membership_id: membership.id })
        .eq("id", supabaseUserId);
    }
  }

  return NextResponse.json({ received: true });
}
