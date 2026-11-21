// The sentences /api/whop/checkout answers with when it cannot start a
// checkout, and the /pricing card shows under the button that was clicked.
//
// Not a server crash, so not a 500 (final-check A8): billing not configured
// in this environment, or the one plan asked for not configured, is the
// service being unavailable — 503. Every one of them says that nothing was
// charged, because nothing was: the route returns before it ever calls Whop.
//
// A Vercel Preview is the expected case. WHOP_API_KEY and
// WHOP_WEBHOOK_SECRET are production-only variables, so on a Preview
// getWhop() is null and Choose always lands here — which is correct (a
// preview must never take a real payment) and is said plainly rather than
// looking like a fault.

export const CHECKOUT_PREVIEW_OFF =
  "Checkout is off on preview builds, so nothing was charged. Plans can be bought on seededtennis.com.";

export const CHECKOUT_NOT_CONFIGURED =
  "Checkout isn't available right now, so nothing was charged. Please try again later.";

export const CHECKOUT_PLAN_UNAVAILABLE =
  "That plan isn't available right now, so nothing was charged. Please try again later.";

/** Which "not configured" sentence this deployment gives. */
export function checkoutNotConfiguredMessage(vercelEnv: string | undefined): string {
  return vercelEnv === "preview" ? CHECKOUT_PREVIEW_OFF : CHECKOUT_NOT_CONFIGURED;
}

export const CHECKOUT_FAILED =
  "Couldn't start checkout, so nothing was charged. Try again in a minute.";

/**
 * What the /pricing card says when /api/whop/checkout did not return a
 * checkout URL. The route's own sentence when it sent one; otherwise the
 * fixed CHECKOUT_FAILED — never a parser error. (A platform error page is
 * HTML, and the old `await res.json()` surfaced the SyntaxError's text,
 * "Unexpected token '<'…", as the message.)
 */
export function checkoutFailureMessage(payload: unknown): string {
  const error = (payload as { error?: unknown } | null)?.error;
  return typeof error === "string" && error.trim() ? error : CHECKOUT_FAILED;
}
