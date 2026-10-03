import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SubscriptionTier } from "@/lib/types";

// The only place subscription_tier is ever written — Stripe is the source
// of truth for who's paying, not anything the client can set directly.

function tierForPriceId(priceId: string | undefined): SubscriptionTier {
  if (priceId && priceId === STRIPE_PRICE_IDS.family) return "family";
  if (priceId && priceId === STRIPE_PRICE_IDS.player) return "player";
  return "free";
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !admin || !webhookSecret) {
    return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const tier = session.metadata?.tier as SubscriptionTier | undefined;
      if (userId && (tier === "player" || tier === "family")) {
        await admin
          .from("profiles")
          .update({
            subscription_tier: tier,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: (session.subscription as string) ?? null,
          })
          .eq("id", userId);
      }
      break;
    }

    // Covers plan changes (Player <-> Family) and Stripe's own status
    // changes (e.g. past_due) — re-derives the tier from whatever price is
    // actually active, rather than trusting stale metadata.
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      const tier = subscription.status === "active" || subscription.status === "trialing"
        ? tierForPriceId(priceId)
        : "free";
      await admin
        .from("profiles")
        .update({ subscription_tier: tier })
        .eq("stripe_customer_id", subscription.customer as string);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await admin
        .from("profiles")
        .update({ subscription_tier: "free", stripe_subscription_id: null })
        .eq("stripe_customer_id", subscription.customer as string);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
