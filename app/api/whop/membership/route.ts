import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/api-auth";
import { getWhop } from "@/lib/whop";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Read-only companion to /settings/billing — never mutates anything. Looks
// up the signed-in user's whop_membership_id (written only by the webhook,
// never by the client) and, if one exists, fetches the live membership from
// Whop for the few fields Supabase doesn't store: renewal date and the
// per-membership manage_url (Whop's own hosted billing portal link — see
// Membership.d.ts's doc comment: "URL where the buyer can sign in to manage
// billing"). Nothing here can change a subscription; retrieve() is a GET.
export async function GET(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ membership: null });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("whop_membership_id")
    .eq("id", user.id)
    .maybeSingle();

  const membershipId = profile?.whop_membership_id as string | null | undefined;
  if (!membershipId) {
    return NextResponse.json({ membership: null });
  }

  const whop = getWhop();
  if (!whop) {
    return NextResponse.json({ membership: null });
  }

  try {
    const membership = await whop.memberships.retrieve({ id: membershipId });
    return NextResponse.json({
      membership: {
        status: membership.status,
        currentPeriodEnd: membership.current_period_end,
        cancelAtPeriodEnd: membership.cancel_at_period_end,
        manageUrl: membership.manage_url,
      },
    });
  } catch {
    // A deleted/unreachable membership (or a Whop API hiccup) should never
    // break the billing page — it just falls back to the tier-only view
    // (no renewal date, generic portal link) the same as a free account.
    return NextResponse.json({ membership: null });
  }
}
