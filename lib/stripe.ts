import Stripe from "stripe";

// Null when STRIPE_SECRET_KEY isn't set yet, matching the rest of the app's
// pattern of degrading gracefully instead of crashing without optional keys.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    client = new Stripe(key, { apiVersion: "2026-09-30.endive" });
  }
  return client;
}

export const STRIPE_PRICE_IDS = {
  player: process.env.STRIPE_PRICE_PLAYER,
  family: process.env.STRIPE_PRICE_FAMILY,
} as const;
