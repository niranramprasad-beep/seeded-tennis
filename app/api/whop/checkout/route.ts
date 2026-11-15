import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { getWhop, WHOP_PLAN_IDS } from "@/lib/whop";
import type { SubscriptionTier } from "@/lib/types";

export async function POST(req: Request) {
  const whop = getWhop();
  if (!whop) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
  }

  const body = (await req.json()) as { tier?: SubscriptionTier };
  if (body.tier !== "player" && body.tier !== "family") {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const tier = body.tier;
  const planId = WHOP_PLAN_IDS[tier];
  if (!planId) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  // S-6: needs a request-scoped client (not just the decoded user) so the
  // limiter's RPC runs as this caller. Creating a Whop checkout
  // configuration is an outbound call to a paid provider on every request,
  // so it is rate-limited like any other write.
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const user = ctx.user;

  const limited = await rateLimited(ctx.supabase, "whop_checkout");
  if (limited) return limited;

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const config = await whop.checkoutConfigurations.create({
    plan_id: planId,
    metadata: { supabase_user_id: user.id, tier },
    redirect_url: `${origin}/dashboard?checkout=success`,
  });

  if (!config.purchase_url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  const url = config.purchase_url.startsWith("http")
    ? config.purchase_url
    : `https://whop.com${config.purchase_url}`;

  return NextResponse.json({ url });
}
