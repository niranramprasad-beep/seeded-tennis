import { NextResponse } from "next/server";
import { parseRequestBody } from "@/lib/api-body";
import {
  CHECKOUT_NO_URL,
  CHECKOUT_PLAN_UNAVAILABLE,
  CHECKOUT_WHOP_UNREACHABLE,
  checkoutNotConfiguredMessage,
} from "@/lib/checkout-messages";
import { z } from "zod";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { getWhop, planIdFor } from "@/lib/whop";
import { logServerError } from "@/lib/server-log";

const ROUTE = "/api/whop/checkout";

const BodySchema = z.object({
  tier: z.enum(["player", "family"], { message: "Unknown plan." }),
  // Defaulted rather than required so an older client (or a bookmarked
  // fetch) keeps working and gets the monthly plan, which is what it always
  // got before yearly existed.
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

export async function POST(req: Request) {
  const whop = getWhop();
  if (!whop) {
    logServerError("whop.checkout.not_configured", null, { route: ROUTE });
    // 503, not 500: nothing crashed. On a Vercel Preview this is the normal
    // state (the Whop key is a production-only variable). lib/checkout-messages.ts.
    return NextResponse.json(
      { error: checkoutNotConfiguredMessage(process.env.VERCEL_ENV) },
      { status: 503 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = parseRequestBody(BodySchema, json, "Choose the Player or Family plan to check out.");
  if (!parsed.ok) return parsed.response;
  const { tier, interval } = parsed.data;

  const planId = planIdFor(tier, interval);
  if (!planId) {
    // Deliberately NOT falling back to the other interval or to a legacy
    // plan. A missing env var means we do not know what to charge, and
    // charging the wrong price is worse than not selling.
    logServerError("whop.checkout.plan_unavailable", null, { route: ROUTE, tier, interval });
    return NextResponse.json({ error: CHECKOUT_PLAN_UNAVAILABLE }, { status: 503 });
  }

  // S-6: needs a request-scoped client (not just the decoded user) so the
  // limiter's RPC runs as this caller. Creating a Whop checkout
  // configuration is an outbound call to a paid provider on every request,
  // so it is rate-limited like any other write.
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = await rateLimited(ctx.supabase, "whop_checkout");
  if (limited) return limited;

  // Where Whop sends the buyer back. It was built from the request's Origin
  // header (S-11): a header the caller controls, and on a local server an
  // http:// origin that Whop rejects outright ("must start with https://"),
  // which surfaced as a bare 500. Now: production always returns to the
  // real site; a Vercel preview returns to its own https URL.
  const returnBase = checkoutReturnBase();
  let config: Awaited<ReturnType<typeof whop.checkoutConfigurations.create>>;
  try {
    config = await whop.checkoutConfigurations.create({
      // `variant_id`, not `plan_id`. Whop's 2026-11-14 API renamed plans to
      // variants across the board; @whop/sdk 2.8.1 follows it. The ids
      // themselves are unchanged and still `plan_`-prefixed.
      variant_id: planId,
      // Read back by both the webhook and /api/whop/sync. It is the only
      // reliable link between a Whop membership and a Seeded account — the
      // email fallback in lib/whop-sync.ts exists for purchases that never
      // came through here, and is a guess by comparison.
      metadata: { supabase_user_id: ctx.user.id, tier, interval },
      redirect_url: `${returnBase}/dashboard?checkout=success`,
    });
  } catch (err) {
    logServerError("whop.checkout.create_failed", err, { route: ROUTE, tier, interval });
    return NextResponse.json(
      { error: CHECKOUT_WHOP_UNREACHABLE },
      { status: 502 }
    );
  }

  if (!config.purchase_url) {
    logServerError("whop.checkout.no_purchase_url", null, { route: ROUTE, tier, interval });
    // Whop answered without a checkout URL: an upstream problem, so 502 like
    // the failed call above, not a crash of ours.
    return NextResponse.json(
      { error: CHECKOUT_NO_URL },
      { status: 502 }
    );
  }

  const url = config.purchase_url.startsWith("http")
    ? config.purchase_url
    : `https://whop.com${config.purchase_url}`;

  return NextResponse.json({ url });
}

/** The https base Whop returns the buyer to. Never derived from a request
 * header. Production: the real domain. Vercel preview: that deployment's own
 * URL (VERCEL_URL is set by Vercel, without a scheme). Anything else falls
 * back to production, so a misconfigured environment sends buyers to the
 * real site rather than somewhere unknown. */
function checkoutReturnBase(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://seededtennis.com";
}
