import { NextResponse } from "next/server";
import { logServerError } from "@/lib/server-log";
import { checkDatabaseReachable, healthResponseBody } from "@/lib/health";

// P1-OPS-2. What the hourly uptime workflow (.github/workflows/uptime.yml)
// and a person with curl ask: is this deployment up, which commit is it,
// and can it reach its Supabase project?
//
// No auth, no body, no table read, no service role. The database check is
// Supabase Auth's public health endpoint, cached per instance for 30 s, so
// hammering this route cannot hammer Supabase (lib/health.ts).
//
// 200 when the app is up and Supabase answers. 503 when Supabase does not
// answer (or, on production, is not configured): an uptime check that only
// proved the Next.js server was alive would pass while every signed-in
// screen failed. The body never carries upstream error text.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Spelled out as literal `process.env.X` reads (not `process.env` passed
  // whole), so Next inlines the public pair at build time the same way
  // lib/api-auth.ts gets them, and the server-only Vercel pair is read at
  // runtime.
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  };
  const database = await checkDatabaseReachable({
    env,
    onFailure: (err) => logServerError("health.database_unreachable", err, { route: "/api/health" }),
  });
  const { status, body } = healthResponseBody(database, env);
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
