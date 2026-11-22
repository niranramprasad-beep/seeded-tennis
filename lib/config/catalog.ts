// Catalog phase 1 (migration 048): the feature flag for showing imported
// programs on /schools.
//
// Same pattern and strictness as NEXT_PUBLIC_GOOGLE_AUTH_ENABLED
// (lib/config/auth.ts): only the literal string "true" turns it on; unset,
// "1", "TRUE", "yes" are all off. NEXT_PUBLIC_ so it is inlined at build
// time and identical on the server and in the browser. It decides whether a
// section renders, not what anyone may read — the catalog tables are public
// read either way (048's RLS).
//
// OFF (the default) = /schools is exactly what it was before 048: the
// section is not rendered and the imported tables are never queried.
// Turn it on only after migration 048 is on the target project and the
// roster import has run there.

//
// Vercel PREVIEW builds show it regardless (2026-11-21, so a catalog import
// can be checked on the Preview): every Preview reads STAGING, which holds
// 048 and the imported rows. NEXT_PUBLIC_VERCEL_ENV is Vercel's own system
// variable ("production" | "preview" | "development"), inlined at build
// time; production is still decided only by the explicit flag above.

export const CATALOG_PHASE1_ENABLED =
  process.env.NEXT_PUBLIC_CATALOG_PHASE1_ENABLED === "true" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
