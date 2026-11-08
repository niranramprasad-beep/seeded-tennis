// Server-side GA4 reporting via the Measurement Protocol — lets the Whop
// webhook (which runs on the server, with no browser) record a purchase.
// Degrades to a no-op if the secret isn't configured yet, same pattern as
// every other optional integration in this app (Whop, Supabase admin).

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const API_SECRET = process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET;

interface PurchaseEventInput {
  transactionId: string;
  value: number;
  itemName: string;
}

// The Measurement Protocol requires a client_id, but a server webhook has
// no browser session to read a real one from. Using a fixed id means every
// server-reported purchase groups under one synthetic "user" in GA4 — the
// revenue total is accurate, but GA4 can't tie a purchase back to which
// real visit or traffic source led to it. Fixing that needs a real
// client_id threaded through checkout, which Seeded doesn't do yet.
const SERVER_CLIENT_ID = "server.webhook";

export async function reportPurchaseToGA4(input: PurchaseEventInput): Promise<void> {
  if (!MEASUREMENT_ID || !API_SECRET) return;

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: SERVER_CLIENT_ID,
          events: [
            {
              name: "purchase",
              params: {
                transaction_id: input.transactionId,
                value: input.value,
                currency: "USD",
                items: [{ item_name: input.itemName, price: input.value, quantity: 1 }],
              },
            },
          ],
        }),
      }
    );
  } catch {
    // Best-effort only — a GA4 reporting failure must never block granting
    // or revoking access, which is the actually business-critical part of
    // this webhook.
  }
}
