import { NextResponse } from "next/server";
import type { z } from "zod";

// Every API route that validates a JSON body goes through parseRequestBody.
//
// What a 400 says (final-check A15): one of OUR sentences, never zod's own
// text. Routes used to return `parsed.error.issues[0]?.message`, so a null
// body (or a non-JSON one, which `req.json().catch(() => null)` turns into
// null) answered "Invalid input: expected object, received null" — not a
// leak, but not a sentence a person should ever read either.
//
// How: zod 4's per-parse error map. A message written on the schema itself
// (`z.enum([...], { message: "Unknown plan." })`, `.min(1, "A date is
// required.")`, `.refine(fn, PROFILE_NAME_REQUIRED)`) takes precedence over
// it and survives; every issue the schema has no sentence for — wrong type,
// missing key, null body, unknown union branch — gets the route's own fixed
// fallback instead of zod's default text. bodyErrorSentence() then refuses
// anything that still reads like zod's default wording, so a future zod that
// changes the precedence fails closed to the fallback rather than open.
//
// lib/api-body.test.ts fails the build if a route under app/api calls
// safeParse itself or reads `.issues` / `.error.message` from a zod result.

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** zod's own default wording (en locale), for the fail-closed check.
 *
 * RULE FOR OUR OWN MESSAGES: a sentence written on a schema must NOT start
 * with "Invalid", "Too small", "Too big", "Unrecognized", "Expected" or
 * "Required", and must not contain the words "expected" or "received" —
 * this check would replace it with the route's fallback. Write "Enter a
 * date." rather than "Invalid date.". (lib/api-body.test.ts lists the
 * schema sentences a garbage body may get back.) */
const ZOD_DEFAULT_TEXT =
  /^(invalid\b|too (small|big)\b|unrecognized\b|expected\b|required\b)|\b(expected|received)\b/i;

export function looksLikeZodDefault(message: string): boolean {
  return ZOD_DEFAULT_TEXT.test(message);
}

/** The sentence a 400 carries: the schema's own message if it wrote one,
 * otherwise `fallback`. Never zod's default text. */
export function bodyErrorSentence(error: z.ZodError, fallback: string): string {
  const message = error.issues[0]?.message;
  if (!message || looksLikeZodDefault(message)) return fallback;
  return message;
}

export function parseRequestBody<S extends z.ZodType>(
  schema: S,
  json: unknown,
  fallback: string
): ParsedBody<z.output<S>> {
  const parsed = schema.safeParse(json, { error: () => fallback });
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    response: NextResponse.json({ error: bodyErrorSentence(parsed.error, fallback) }, { status: 400 }),
  };
}
