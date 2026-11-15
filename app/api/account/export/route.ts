import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { buildAccountExport } from "@/lib/db/account-export";

// P0-8. The complete, machine-readable record of everything stored about the
// calling account — see lib/db/account-export.ts for what is in it, what is
// not, and why each omission is a decision rather than an oversight.
//
// GET, not POST: it changes nothing, and a plain GET means the browser can
// hand the person a file with one link rather than needing a fetch, a blob
// and an object URL. It still requires the bearer token, so it is not a URL
// anybody can share.
export async function GET(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Tightest bucket we have (3/hour): this reads every table the caller owns,
  // so it is both the most expensive call in the app and the most useful one
  // to loop if you were trying to make the database work.
  const limited = await rateLimited(ctx.supabase, "data_export");
  if (limited) return limited;

  try {
    const payload = await buildAccountExport(ctx.supabase, ctx.user.id);
    const date = payload.exported_at.slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="seeded-data-${date}.json"`,
        // Never let a CDN or a shared browser cache hold a copy of someone's
        // whole record.
        "cache-control": "no-store, private",
      },
    });
  } catch {
    // Deliberately generic (S-10): the message would otherwise carry table
    // and column names straight from Postgres to the client.
    return NextResponse.json(
      { error: "Could not build your download. Try again." },
      { status: 500 }
    );
  }
}
