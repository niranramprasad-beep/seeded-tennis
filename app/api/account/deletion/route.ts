import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-log";
import { deleteMyAccount } from "@/lib/db/settings";

// P0-8. This route used to start and cancel a 30-day "deletion grace
// period" that deleted nothing — it set profiles.deletion_requested_at and
// a person was expected to action it by hand. P0-7 had already been forced
// to rewrite the UI copy because of it ("Removes everything within 30 days"
// was false). Migration 029 added public.delete_my_account(), so this now
// deletes.
//
// The two old actions are gone rather than kept alongside: a "request" that
// queues nothing and a "cancel" for a queue that does not exist are two
// buttons that lie. Rows that still carry deletion_requested_at from the
// old flow are untouched and still owed a real deletion by hand — see the
// column comment added by 029.
//
// Irreversible, so the gate is in three places and this is only the last of
// them: the dialog needs an explicit checkbox AND the word DELETE typed
// (components/seeded/settings/delete-account-dialog.tsx), this route
// requires the matching confirm string, and the RPC takes no user id at all
// so it can only ever delete its own caller.
const BodySchema = z.object({
  action: z.literal("delete"),
  /** Must be the literal string DELETE. Not security — the dialog is the
   * real gate — but it means a stray or replayed POST with an empty body
   * cannot destroy an account. */
  confirm: z.literal("DELETE", {
    message: "Type DELETE to confirm.",
  }),
});

export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = await rateLimited(ctx.supabase, "account_deletion");
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const result = await deleteMyAccount(ctx.supabase);
    return NextResponse.json({ ok: true, familyDeleted: result.familyDeleted });
  } catch (err) {
    // The account was NOT deleted. This log line is the only trace of that
    // besides the error the person sees.
    logServerError("account.deletion.failed", err, { route: "/api/account/deletion" });
    return NextResponse.json(
      { error: "Could not delete your account. Try again, or contact support." },
      { status: 500 }
    );
  }
}
