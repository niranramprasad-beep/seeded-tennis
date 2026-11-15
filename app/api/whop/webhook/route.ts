import { NextResponse } from "next/server";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TIER_PRICE_USD } from "@/lib/types";
import { priceUsdForPlanId } from "@/lib/whop";
import { applyMembershipToProfile, findProfileIdByEmail } from "@/lib/whop-sync";
import { reportPurchaseToGA4 } from "@/lib/ga4-server";

// Whop is the source of truth for who is paying. This is one of the two
// places `subscription_tier` is ever written for a Whop customer (the other
// is /api/whop/sync, the safety net for when this never arrives), and both
// go through applyMembershipToProfile so they cannot disagree.
//
// ---------------------------------------------------------------------------
// THIS ENDPOINT HAS NEVER RECEIVED A DELIVERY
// ---------------------------------------------------------------------------
// Real payments succeeded on 2026-10-03 and 2026-11-02 and the Whop
// dashboard still shows "No deliveries yet" for hook_ActwvOQFQX4Pm. The
// buyer's profile is still `free` with a null whop_membership_id — they paid
// and got nothing. Diagnosis and the dashboard changes are in
// docs/HANDOFF.md §K; the short version is that the endpoint is on a legacy
// (v2/v5) payload version while the three events it subscribes to are v1
// names, so nothing ever matched.
//
// Two consequences for this file, both deliberate:
//
//  1. The plan arrives as `variant_id`, and getting that wrong is how this
//     fails silently a second time. CONFIRMED against the live API on
//     2026-11-14 by reading the real membership at this exact
//     `api_version_date`: the resource has `variant_id`, `product_id`,
//     `status`, `metadata` — and **no `plan_id` and no nested `plan`**.
//     Whop's 2026-11-14 version renamed plans to variants throughout
//     (@whop/sdk 2.8.1 follows it); the ids are unchanged and still
//     `plan_`-prefixed. An earlier draft of this file read `plan_id ??
//     plan?.id`, neither of which exists, so every delivery would have
//     resolved to "unknown plan" and granted nothing — the same silent
//     nothing as the original outage, one layer further in.
//     The older names are still accepted below, because a webhook pinned to
//     an older `api_version_date` would send them and costing two `??` to
//     survive that is nothing.
//  2. The maintenance middleware on `main` currently returns 503 for every
//     path including this one, so deliveries AND replays are blocked until
//     it is amended. See docs/HANDOFF.md §K step 4.

interface MembershipEventData {
  id?: string;
  status?: string;
  /** The 2026-11-14 shape. */
  variant_id?: string;
  /** Pre-2026-11-14 shapes, still accepted. */
  plan_id?: string;
  plan?: { id?: string } | null;
  metadata?: Record<string, unknown> | null;
  /** The live resource has no top-level email and `member` is often null, so
   * every path here is a maybe. The email fallback is best-effort by
   * design — see findProfileIdByEmail. */
  email?: string | null;
  user?: { email?: string | null } | null;
  member?: { email?: string | null; user?: { email?: string | null } | null } | null;
}

interface MembershipEvent {
  type?: string;
  data?: MembershipEventData;
}

const HANDLED_EVENTS = new Set([
  "membership.activated",
  "membership.updated",
  "membership.deactivated",
]);

function planIdOf(data: MembershipEventData): string | null {
  return data.variant_id ?? data.plan_id ?? data.plan?.id ?? null;
}

function emailOf(data: MembershipEventData): string | null {
  return (
    data.member?.email ??
    data.member?.user?.email ??
    data.user?.email ??
    data.email ??
    null
  );
}

/** Server-side only, and deliberately without the email itself: a webhook log
 * line is not a place to write a customer's address. */
function log(message: string, detail: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(`[whop/webhook] ${message}`, JSON.stringify(detail));
}

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET;
  if (!admin || !webhookSecret) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
  }

  // unwrapWebhook needs the exact, unparsed bytes to verify the signature —
  // reading the body as JSON first would change them and fail verification.
  // It implements the Standard Webhooks scheme (webhook-id /
  // webhook-timestamp / webhook-signature), which is Whop's **v1** format. A
  // legacy-version endpoint signs differently and will never verify here.
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  let event: MembershipEvent;
  try {
    event = unwrapWebhook<MembershipEvent>(payload, { headers, key: webhookSecret });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      log("signature rejected");
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }
    throw err;
  }

  const type = event.type ?? "";
  const data = event.data ?? {};

  if (!HANDLED_EVENTS.has(type)) {
    // 200, not 4xx: an unhandled event is not a delivery failure, and
    // returning an error would make Whop retry it and eventually disable the
    // endpoint for "delivery failures".
    return NextResponse.json({ received: true, handled: false });
  }

  const membershipId = data.id;
  const status = data.status;
  if (!membershipId || !status) {
    log("membership event missing id or status", { type });
    return NextResponse.json({ received: true, handled: false });
  }

  // Who is this? Metadata first — every checkout we start sets it.
  let supabaseUserId =
    typeof data.metadata?.supabase_user_id === "string" ? data.metadata.supabase_user_id : null;
  let matchedBy: "metadata" | "email" | null = supabaseUserId ? "metadata" : null;

  if (!supabaseUserId) {
    // A purchase from Whop's own product page, a shared plan link, a
    // membership created by hand — none of those carry our metadata. The old
    // handler returned 200 and did nothing, so the person paid and got
    // nothing with no trace. Try the buyer's email, require exactly one
    // match, and log either way.
    supabaseUserId = await findProfileIdByEmail(admin, emailOf(data));
    matchedBy = supabaseUserId ? "email" : null;
    if (supabaseUserId) {
      log("no metadata.supabase_user_id; matched buyer by email", { type, membershipId });
    }
  }

  if (!supabaseUserId) {
    // Never throw here. An unmatched membership is a real event about a real
    // payment, and crashing turns it into a retry storm and then a disabled
    // endpoint. Log it loudly, acknowledge it, and let a person reconcile.
    log("UNMATCHED membership — no metadata and no unique email match", {
      type,
      membershipId,
      status,
      hasEmail: Boolean(emailOf(data)),
    });
    return NextResponse.json({ received: true, handled: false, matched: false });
  }

  const planId = planIdOf(data);
  const outcome = await applyMembershipToProfile(admin, {
    supabaseUserId,
    membershipId,
    planId,
    status,
  });

  log("applied", { type, membershipId, matchedBy, outcome: outcome.reason });

  // GA4 only for a genuine new activation — "membership.activated" is a
  // one-time lifecycle event per membership, so this cannot double-count the
  // way treating every "updated" as a sale would. The value comes from the
  // PLAN, not the tier: somebody renewing on the old $19 Player plan is
  // still paying $19, and reporting it as the new $12 would understate it.
  if (type === "membership.activated" && outcome.applied && outcome.tier !== "free") {
    const value = priceUsdForPlanId(planId, TIER_PRICE_USD);
    if (value !== null) {
      await reportPurchaseToGA4({
        transactionId: membershipId,
        value,
        itemName: `${outcome.tier} subscription`,
      });
    } else {
      log("skipped GA4 purchase: plan id is not one of ours", { membershipId });
    }
  }

  return NextResponse.json({ received: true, handled: true });
}
