// Server-side GA4 reporting via the Measurement Protocol — lets the Whop
// webhook (which runs on the server, with no browser) record a purchase.
// Degrades to a no-op if the secret isn't configured yet, same pattern as
// every other optional integration in this app (Whop, Supabase admin).
//
// WHAT GOOGLE RECEIVES: the plan, the price and the currency. Nothing else.
// No email, no name, no Supabase user id, no Whop membership or payment id —
// not as user_id, not as transaction_id, not hashed. lib/ga-privacy.test.ts
// pins the payload shape and fails the build if a field is added.
//
// The cost of that: GA4 dedupes purchases on transaction_id, and there is
// none. The webhook only reports "membership.activated", a one-time event
// per membership, so a double count needs Whop to redeliver it.

import { randomUUID } from "node:crypto";

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const API_SECRET = process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET;

export interface PurchaseEventInput {
  /** The tier bought, e.g. "player" or "family". */
  plan: string;
  /** USD price of the plan bought. */
  value: number;
}

/** The exact JSON body sent to /mp/collect. Exported so the guard test can
 * check it without a network call. `clientId` is required by the Measurement
 * Protocol; it is a fresh random UUID per event, tied to nobody. */
export function purchaseEventBody(input: PurchaseEventInput, clientId: string = randomUUID()) {
  return {
    client_id: clientId,
    events: [
      {
        name: "purchase",
        params: {
          value: input.value,
          currency: "USD",
          items: [{ item_name: `${input.plan} subscription`, price: input.value, quantity: 1 }],
        },
      },
    ],
  };
}

export async function reportPurchaseToGA4(input: PurchaseEventInput): Promise<void> {
  if (!MEASUREMENT_ID || !API_SECRET) return;

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify(purchaseEventBody(input)),
      }
    );
  } catch {
    // Best-effort only — a GA4 reporting failure must never block granting
    // or revoking access, which is the actually business-critical part of
    // this webhook.
  }
}
