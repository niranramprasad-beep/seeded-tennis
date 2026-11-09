import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfileRoleAndFamily, getRequestScopedSupabase } from "@/lib/api-auth";
import {
  saveCoachOutreachReminder,
  saveCoachOutreachReplyNote,
  saveCoachOutreachStatus,
} from "@/lib/db/outreach";

// Real write path behind /outreach's board and /coaches' status buttons —
// stage changes, "remind me in 14 days", and reply notes all go through
// here. One endpoint with a discriminated `kind` rather than three, since
// all three act on the same (user_id, school_slug) row and share the same
// auth/ownership check.
const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    schoolSlug: z.string().min(1, "A school is required."),
    status: z.enum(["researching", "emailed", "replied", "call_visit", "offer", "committed"]).nullable(),
  }),
  z.object({
    kind: z.literal("reminder"),
    schoolSlug: z.string().min(1, "A school is required."),
  }),
  z.object({
    kind: z.literal("reply-note"),
    schoolSlug: z.string().min(1, "A school is required."),
    note: z.string(),
  }),
]);

export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { familyCode } = await getProfileRoleAndFamily(ctx.supabase, ctx.user.id);
  const writeCtx = { supabase: ctx.supabase, userId: ctx.user.id, familyCode };

  try {
    if (parsed.data.kind === "status") {
      await saveCoachOutreachStatus(parsed.data.schoolSlug, parsed.data.status, writeCtx);
      return NextResponse.json({ ok: true });
    }
    if (parsed.data.kind === "reminder") {
      const remindAt = await saveCoachOutreachReminder(parsed.data.schoolSlug, writeCtx);
      return NextResponse.json({ remindAt });
    }
    await saveCoachOutreachReplyNote(parsed.data.schoolSlug, parsed.data.note, writeCtx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save that. Try again." },
      { status: 500 }
    );
  }
}
