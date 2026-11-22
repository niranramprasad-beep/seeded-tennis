// Where scripts/import-rosters.ts may write. Pure, so the refusal is tested.
//
// CLAUDE.md: production is read-only without the owner's current-turn
// sign-off, and local env files have pointed at production before. So the
// importer does not trust any single signal:
//   * the URL's project ref must not be production's, and must be staging's
//     unless a different non-production ref is named explicitly;
//   * a legacy JWT service key carries its own `ref` claim, which must agree
//     with the URL (a staging URL with a production key is refused too).

const PRODUCTION_PROJECT_REF = "tfpjssmhiptbwigarxpx";
const STAGING_PROJECT_REF = "gnlcpnsweqbtwpaqhqqg";

export function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]{20})\.supabase\.(?:co|in)$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** The `ref` claim of a legacy JWT key; null for sb_secret_ keys or junk. */
export function projectRefFromJwtKey(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

export function assertSafeImportTarget(input: { url: string; key: string; allowRef?: string | null }): string {
  const { url, key, allowRef } = input;
  if (!url) throw new Error("Set SUPABASE_URL (the STAGING project URL) to upsert.");
  if (!key) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY (STAGING's) to upsert. It is never read from a file.");
  if (url.includes(PRODUCTION_PROJECT_REF) || key.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("Refusing: that is the PRODUCTION project. The importer writes to staging only.");
  }
  const ref = projectRefFromUrl(url);
  if (!ref) throw new Error(`Refusing: cannot read a Supabase project ref from ${url}.`);
  if (ref === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing: that is the PRODUCTION project. The importer writes to staging only.");
  }
  if (ref !== STAGING_PROJECT_REF && ref !== allowRef) {
    throw new Error(
      `Refusing: ${ref} is not the staging project (${STAGING_PROJECT_REF}). ` +
        "Pass --allow-ref <ref> to name another non-production project deliberately."
    );
  }
  const keyRef = projectRefFromJwtKey(key);
  if (keyRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Refusing: the service key belongs to the PRODUCTION project.");
  }
  if (keyRef && keyRef !== ref) {
    throw new Error(`Refusing: the service key is for ${keyRef} but the URL is ${ref}.`);
  }
  return ref;
}
