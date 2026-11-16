// Shared browser-side helper for calling this app's own zod-validated write
// routes (app/api/account/deletion, app/api/family/budget*, app/api/outreach).
// Attaches the signed-in user's access token the same way
// components/seeded/settings/seeded-billing-view.tsx and lib/db/settings.ts's
// loadMembershipSnapshot already do for /api/whop/membership, and turns a
// non-2xx response into a real thrown Error carrying the SERVER's specific
// validation/failure message — not a generic "something went wrong" — so
// every existing catch (err) { setError(err.message) } call site in the UI
// (components/seeded/family/budget-modals.tsx, components/coaches/
// coaches-view.tsx, ...) keeps working completely unchanged while the
// actual Supabase write now happens behind real server-side zod validation
// instead of directly from the browser.
import { getSupabase } from "@/lib/supabase/client";

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in first.");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong. Try again.");
  }
  return payload as T;
}

/**
 * Same auth and same error contract as postJson, but for a GET that returns
 * a file body rather than a JSON envelope — currently only
 * /api/account/export (P0-8), which streams the caller's whole record.
 *
 * It cannot be a plain <a href>: the route authenticates with a bearer
 * token, and a link carries no headers. Putting the token in the URL instead
 * would write a credential into history, the referrer and any proxy log.
 *
 * A failure still arrives as JSON ({ error }), so this reads the body as
 * text and only tries to parse it when the response was NOT ok — the success
 * path never parses the thing it is about to hand to the user.
 */
export async function getText(url: string): Promise<string> {
  const supabase = getSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in first.");

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error("Can't reach the server right now. Check your connection and try again.");
  }

  const body = await res.text();
  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string") message = parsed.error;
    } catch {
      // Not JSON (a proxy error page, say) — keep the generic message rather
      // than showing the user raw HTML.
    }
    throw new Error(message);
  }
  return body;
}
