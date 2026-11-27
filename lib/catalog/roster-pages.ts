// Roster pages (migration 054): the owner's sheet "College Tennis UTR
// Database" -> program_roster (players by name) and program_staff (coaching
// staff). Niran's decision, 2026-11-22 (DECISIONS.md). Pure; the runner is
// scripts/import-utr-database.ts --roster.
//
// Rules, each tested in roster-pages.test.ts:
//   1. A player is listed only if on the OFFICIAL roster (onOfficialRoster in
//      utr-database.ts: "UTR only" and "not on roster page yet" rows are
//      left out, as the sheet's own team counts do).
//   2. A rating is kept only with the UTR profile link it was read from;
//      "reliable" only when the sheet says Y.
//   3. Staff come from the Program Info tab (head coach + title, assistants
//      "Name — Title; …", published emails "Name: email; …"), each with the
//      page they were read from. An email is kept only with the Staff Email
//      Source URL. A team with no Program Info row gets its head coach from
//      the Teams tab, sourced to its official roster page.
//   4. Only programs this import writes get rows; nothing is guessed.

import { onOfficialRoster, parseCsv, rating } from "./utr-database";
import { programSlug, type CatalogGender } from "./roster-import";

export interface RosterPlayerDraft {
  slug: string;
  playerName: string;
  classLabel: string | null;
  gradYear: number | null;
  utr: number | null;
  utrReliable: boolean;
  utrProfileUrl: string | null;
  readDate: string;
}

export interface StaffDraft {
  slug: string;
  name: string;
  title: string | null;
  email: string | null;
  isHead: boolean;
  sourceUrl: string;
  readDate: string;
}

function rows(csv: string): Record<string, string>[] {
  const r = parseCsv(csv);
  if (r.length === 0) return [];
  const header = r[0].map((h) => h.trim());
  return r.slice(1).map((x) => Object.fromEntries(header.map((h, i) => [h, (x[i] ?? "").trim()])));
}

function gender(raw: string): CatalogGender | null {
  const g = raw.trim().toUpperCase();
  if (g === "M" || g === "MEN") return "men";
  if (g === "W" || g === "WOMEN") return "women";
  return null;
}

const url = (raw: string | undefined): string | null => (raw && /^https?:\/\/\S+$/i.test(raw.trim()) ? raw.trim() : null);
const iso = (raw: string | undefined): string | null => {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T]00:00(?::00)?)?$/.exec((raw ?? "").trim());
  return m ? m[1] : null;
};

const CLASS_LABELS: Record<string, string> = {
  fr: "Freshman",
  freshman: "Freshman",
  "r-fr": "Redshirt Freshman",
  so: "Sophomore",
  sophomore: "Sophomore",
  jr: "Junior",
  junior: "Junior",
  sr: "Senior",
  senior: "Senior",
  gr: "Graduate",
  grad: "Graduate",
  graduate: "Graduate",
  "5th": "5th year",
  "5th year": "5th year",
};

/** "Fr." -> "Freshman"; anything unknown is kept as printed. */
export function classLabel(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  return CLASS_LABELS[s.toLowerCase().replace(/\.$/, "")] ?? s;
}

/** "Name — Title; Name — Title" (also "-" or "–"). */
export function parseNameTitles(raw: string): { name: string; title: string | null }[] {
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [name, ...rest] = p.split(/\s+[—–-]\s+/);
      return { name: name.trim(), title: rest.join(" — ").trim() || null };
    })
    .filter((p) => p.name.length > 0);
}

/** "Name: email; Name: email" -> name -> email (only well-formed addresses). */
export function parseEmails(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of raw.split(";")) {
    const m = /^\s*(.+?)\s*:\s*([^@\s]+@[^@\s]+\.[^@\s]+)\s*$/.exec(part);
    if (m) out.set(m[1].trim(), m[2].trim());
  }
  return out;
}

export function parseRosterPages(input: {
  teamsCsv: string;
  playersCsv: string;
  programInfoCsv: string | null;
  /** Slugs of the programs this import writes (rule 4). */
  importedSlugs: ReadonlySet<string>;
}): { players: RosterPlayerDraft[]; staff: StaffDraft[]; dropped: string[] } {
  const players: RosterPlayerDraft[] = [];
  const staff: StaffDraft[] = [];
  const dropped: string[] = [];

  const teams = new Map<string, Record<string, string>>();
  for (const t of rows(input.teamsCsv)) {
    const g = gender(t["Gender"]);
    if (!g || !t["School"]) continue;
    teams.set(programSlug(t["School"], g), t);
  }

  const seen = new Set<string>();
  for (const p of rows(input.playersCsv)) {
    const g = gender(p["Gender"]);
    if (!g || !p["School"] || !p["Player Name"]) continue;
    const slug = programSlug(p["School"], g);
    if (!input.importedSlugs.has(slug)) continue; // rule 4
    if (!onOfficialRoster(p["Roster Check"] ?? "")) continue; // rule 1
    const key = `${slug}|${p["Player Name"].toLowerCase()}`;
    if (seen.has(key)) {
      dropped.push(`${slug}: a player appears twice — kept the first row`);
      continue;
    }
    seen.add(key);
    const profile = url(p["Player UTR Link"]);
    const value = profile ? rating(p["UTR Rating"] ?? "") : null; // rule 2
    const readDate = iso(p["UTR Read Date"]) ?? iso(teams.get(slug)?.["Last Verified"]);
    if (!readDate) {
      dropped.push(`${slug}: a player row has no read date and its team no Last Verified — left out`);
      continue;
    }
    const grad = Number(p["Grad Year"]);
    players.push({
      slug,
      playerName: p["Player Name"],
      classLabel: classLabel(p["Class Year"] ?? ""),
      gradYear: Number.isInteger(grad) && grad >= 2000 && grad <= 2100 ? grad : null,
      utr: value,
      utrReliable: value !== null && (p["Reliable? (Y/N)"] ?? "").toUpperCase() === "Y",
      utrProfileUrl: profile,
      // Hometown is not read (Niran, 2026-11-27): no page shows it, so the
      // import no longer copies it into a publicly readable table.
      readDate,
    });
  }

  const withInfo = new Set<string>();
  for (const r of input.programInfoCsv ? rows(input.programInfoCsv) : []) {
    const g = gender(r["Gender"]);
    if (!g || !r["School"]) continue;
    const slug = programSlug(r["School"], g);
    if (!input.importedSlugs.has(slug)) continue;
    const readDate = iso(r["School Data Read Date"]);
    const pageUrl = url(r["Coaches Page URL"]) ?? url(r["Staff Email Source URL"]);
    if (!readDate || !pageUrl) {
      dropped.push(`${slug}: staff have no source page or read date — left out`);
      continue;
    }
    withInfo.add(slug);
    const emailSource = url(r["Staff Email Source URL"]);
    const emails = emailSource ? parseEmails(r["Published Staff Emails (name: email; …)"] ?? "") : new Map<string, string>();
    const people: { name: string; title: string | null; isHead: boolean }[] = [];
    if (r["Head Coach"]) people.push({ name: r["Head Coach"], title: r["Head Coach Title"] || "Head Coach", isHead: true });
    for (const a of parseNameTitles(r["Assistant Coaches (name — title; …)"] ?? "")) people.push({ ...a, isHead: false });
    const names = new Set<string>();
    for (const person of people) {
      if (names.has(person.name)) continue;
      names.add(person.name);
      const email = emails.get(person.name) ?? null;
      staff.push({
        slug,
        name: person.name,
        title: person.title,
        email,
        isHead: person.isHead,
        // The email's own page when there is an email, else the coaches page.
        sourceUrl: email && emailSource ? emailSource : pageUrl,
        readDate,
      });
    }
  }

  // Rule 3's fallback: a head coach from the Teams tab, sourced to the roster.
  for (const [slug, t] of teams) {
    if (withInfo.has(slug) || !input.importedSlugs.has(slug) || !t["Head Coach"]) continue;
    const src = url(t["Official Roster URL"]);
    const readDate = iso(t["Last Verified"]);
    if (!src || !readDate) continue;
    staff.push({ slug, name: t["Head Coach"], title: "Head Coach", email: null, isHead: true, sourceUrl: src, readDate });
  }

  return { players, staff, dropped };
}

function lit(v: string | number | boolean | null): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

/** Statements for buildUtrDatabaseSql's transaction: each imported program's
 * roster and staff are REPLACED (a roster is a snapshot). Refuses without 054. */
export function buildRosterPagesSql(
  data: { players: readonly RosterPlayerDraft[]; staff: readonly StaffDraft[] },
  slugs: readonly string[]
): string[] {
  if (slugs.length === 0) return [];
  const inList = slugs.map(lit).join(",");
  const out = [
    "do $$ begin\n  if to_regclass('public.program_roster') is null or to_regclass('public.program_staff') is null then\n" +
      "    raise exception 'migration 054 is not on this database: refusing';\n  end if;\nend $$;",
    `delete from public.program_roster r using public.programs p where r.program_id = p.id and p.slug in (${inList});`,
    `delete from public.program_staff s using public.programs p where s.program_id = p.id and p.slug in (${inList});`,
  ];
  if (data.players.length) {
    out.push(
      "insert into public.program_roster (program_id, player_name, class_label, grad_year, utr, utr_reliable, utr_profile_url, read_date)\n" +
        "select p.id, v.n, v.c, v.g, v.u, v.r, v.l, v.h, v.d::date from (values\n" +
        data.players
          .map(
            (x) =>
              `(${lit(x.slug)},${lit(x.playerName)},${lit(x.classLabel)}::text,${lit(x.gradYear)}::int,${lit(x.utr)}::numeric,${lit(x.utrReliable)},${lit(x.utrProfileUrl)}::text,${lit(x.readDate)})`
          )
          .join(",\n") +
        "\n) as v(slug, n, c, g, u, r, l, h, d) join public.programs p on p.slug = v.slug;"
    );
  }
  if (data.staff.length) {
    out.push(
      "insert into public.program_staff (program_id, name, title, email, is_head, source_url, read_date)\n" +
        "select p.id, v.n, v.t, v.e, v.h, v.s, v.d::date from (values\n" +
        data.staff
          .map(
            (x) =>
              `(${lit(x.slug)},${lit(x.name)},${lit(x.title)}::text,${lit(x.email)}::text,${lit(x.isHead)},${lit(x.sourceUrl)},${lit(x.readDate)})`
          )
          .join(",\n") +
        "\n) as v(slug, n, t, e, h, s, d) join public.programs p on p.slug = v.slug;"
    );
  }
  return out;
}
