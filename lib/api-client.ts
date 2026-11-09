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
