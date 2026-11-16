// Shared literal-narrowing helpers for the DB-read boundary across
// lib/db/* (plus lib/api-auth.ts). The generated Supabase types
// (lib/db/database.types.ts, regenerated against the live schema after
// migrations 011-021) correctly widen every Postgres `text` column that's
// constrained only by a CHECK constraint down to plain `string` — the type
// generator reads information_schema, which has no concept of a CHECK
// constraint's actual allowed literal values. This app's own types stay
// narrow (real literal unions like Intensity, FitLevel, "win" | "loss" |
// null, ...) everywhere else, so every row read back from one of these
// columns has to be narrowed right here, at the single point it crosses
// from Supabase into the app — never by widening the app-level type to
// `string` instead, which would quietly lose real type safety at every
// other place that type is already used (form selects, switch statements,
// etc).
//
// `narrowLiteral`/`narrowNullableLiteral` fall back to a caller-supplied
// default rather than throwing: a single malformed or legacy row (e.g.
// written before the CHECK constraint existed, or by a long-retired code
// path) should degrade just that one row's field to a sane value, not take
// down the whole list/page it's part of. Postgres's own CHECK constraint is
// what actually keeps new writes honest; this is a defensive read-side
// backstop, not the primary guarantee.

/** Narrows `value` to `T` if it's one of `allowed`, else returns `fallback`. */
export function narrowLiteral<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T
): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Same idea, for nullable columns where `null` is itself a valid,
 * meaningful value (e.g. matches.result before a result is ever logged) —
 * an invalid NON-NULL value still falls back to `fallback`, it is never
 * silently promoted to null. */
export function narrowNullableLiteral<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T | null = null
): T | null {
  if (value == null) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Same idea again, for optional (possibly-undefined) columns where a
 * missing value should stay missing rather than become a fabricated
 * default (e.g. profiles.gender before onboarding sets it). */
export function narrowOptionalLiteral<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[]
): T | undefined {
  if (value == null) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
