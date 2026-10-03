import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import type { SubscriptionTier } from "@/lib/types";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
  }

  const body = (await req.json()) as { tier?: SubscriptionTier };
  if (body.tier !== "player" && body.tier !== "family") {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const tier = body.tier;
  const priceId = STRIPE_PRICE_IDS[tier];
  if (!priceId) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const supabase = createClient(url, key);
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id, tier },
    subscription_data: { metadata: { supabase_user_id: user.id, tier } },
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
