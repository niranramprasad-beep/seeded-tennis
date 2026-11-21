// School catalog data access + derived school-facing logic. Real
// consolidation of what used to be spread across the former
// lib/data/index.ts (schools section), lib/data/school-detail.ts
// (combinedScore), and lib/data/index.ts's coach-email generator — same
// functions, same bodies, just one home. The raw literal catalogs backing
// this (mensD1Schools/womensD1Schools/extraSchools) moved alongside it as
// schools-data-{mens,womens,extra}.ts.
//
// Resolve-as-promise matches a real client's shape (components already
// `await` these) so swapping the body for a real `supabase.from("schools")`
// query later needs no call-site changes.

import type { Division, Player, School, SchoolLite } from "@/lib/types";
import { formatDate, getCurrentGrade, ordinalGrade } from "@/lib/time";
import { formatPlayerUtr } from "@/lib/utils";

import { mensD1Schools } from "./schools-data-mens";
import { womensD1Schools } from "./schools-data-womens";
import { extraSchools } from "./schools-data-extra";

// The full catalog. Swapping to Supabase means replacing this with a query.
const schoolsData: School[] = [...mensD1Schools, ...womensD1Schools, ...extraSchools];

function resolve<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

/* ----------------------------------------------------- catalog size facts */

/**
 * How big the catalog actually is, counted from the catalog.
 *
 * Every program count on the marketing pages used to be a literal typed
 * into the copy — "68" in five places across /pricing and /schools. They
 * were not wrong, but they disagreed in a way a visitor notices: /pricing
 * promised 68 programs and /schools listed 37, because 68 is the whole
 * catalogue and 37 is the men's half of it, and neither sentence said which
 * it meant. Two true numbers reading as one broken promise.
 *
 * So: counted here, labelled by gender wherever shown, and guarded by the
 * program-count pattern in lib/copy-honesty.test.ts, which fails the build
 * if a literal count reappears in the copy. (This used to name a
 * lib/catalog-counts.test.ts that has never existed.)
 */
export interface CatalogCounts {
  total: number;
  men: number;
  women: number;
  d1: number;
  d2: number;
  d3: number;
  /** "D1, D2 and D3" — only the divisions actually present. */
  divisionLabel: string;
}

function countCatalog(): CatalogCounts {
  const byDivision = (d: Division) => schoolsData.filter((s) => s.division === d).length;
  const d1 = byDivision("D1");
  const d2 = byDivision("D2");
  const d3 = byDivision("D3");
  const present = (["D1", "D2", "D3"] as const).filter(
    (d) => schoolsData.some((s) => s.division === d)
  );
  const divisionLabel =
    present.length <= 1
      ? present.join("")
      : `${present.slice(0, -1).join(", ")} and ${present[present.length - 1]}`;

  return {
    total: schoolsData.length,
    men: schoolsData.filter((s) => s.gender === "men").length,
    women: schoolsData.filter((s) => s.gender === "women").length,
    d1,
    d2,
    d3,
    divisionLabel,
  };
}

// Computed once at module load from the same array every other query here
// reads. Exported through an async getter so server components keep the
// catalogue out of the client bundle.
const catalogCounts: CatalogCounts = countCatalog();

export async function getCatalogCounts(): Promise<CatalogCounts> {
  return resolve(catalogCounts);
}

/* ----------------------------------------------------------------- schools */

export async function getSchools(): Promise<School[]> {
  return resolve(schoolsData);
}

// Lighter catalog for pages that list/compare/filter schools. Identical to
// getSchools() since P0-3 removed the heavy per-school fields — see the
// SchoolLite comment in lib/types.ts for why the seam is kept.
export async function getSchoolsLite(): Promise<SchoolLite[]> {
  return resolve(schoolsData);
}

export async function getSchool(slug: string): Promise<School | undefined> {
  return resolve(schoolsData.find((s) => s.slug === slug));
}

export async function getSchoolsBySlugs(slugs: string[]): Promise<School[]> {
  const set = new Set(slugs);
  return resolve(schoolsData.filter((s) => set.has(s.slug)));
}

export async function getDivisions(): Promise<Division[]> {
  const order: Division[] = ["D1", "D2", "D3"];
  const present = new Set(schoolsData.map((s) => s.division));
  return resolve(order.filter((d) => present.has(d)));
}

// Blend of academics (US News) and tennis level (avg roster UTR), 0-100.
// Exported for the leaderboard's "combined score" sort. 14.5 ≈ the strongest
// college roster average on the real UTR scale, so it anchors the tennis axis.
export function combinedScore(school: School): number {
  const academic = Math.max(0, 100 - school.usNewsRanking * 0.62);
  const tennis = Math.min(100, (school.avgRosterUTR / 14.5) * 100);
  return Math.round(academic * 0.5 + tennis * 0.5);
}

/* ------------------------------------------------------- data provenance */

// Every surface that renders a school's roster UTR numbers must render this
// next to them. `avgRosterUTR`/`minCompetitiveUTR` are estimates carried in
// the static catalog with no per-school source or date (see the headers in
// schools-data-*.ts). One constant so the label can't drift between the
// school detail page, the Schools browser and the Plan chart — and so it is
// a single edit to swap in real source+date strings when P1-DATA-1 lands.
export const UTR_RANGE_SOURCE_LABEL = "Unverified estimate";

// A web search, not a guessed athletics URL. We do not store per-school
// recruiting or staff-directory links: inventing one that 404s (or worse,
// points at the wrong program) is the same failure mode as inventing the
// coach's name. The user lands on a search result they can verify themselves.
export function staffDirectorySearchQuery(
  school: Pick<School, "name" | "gender">
): string {
  const programType = school.gender === "women" ? "women's" : "men's";
  return `${school.name} ${programType} tennis staff directory`;
}


/* ------------------------------------------------------------- coach email */

// P0-3/P0-4/D3: this text is sent by a real minor to a real college coach.
// Every sentence in it must trace to a stored fact the player entered, or to
// the school's name/division/conference. The builder therefore does not
// produce a string; it produces PARTS, and every part names where its words
// came from. `lib/db/coach-email.test.ts` fails the build if a part has no
// source, a source outside this list, or text its sources cannot account for.
//
// Removed by the D3 audit (2026-11-19), each because nothing stored backs it:
//   - "I've been following {school} closely, and {division} tennis in the
//     {conference} is the level I want to be competing at." The player never
//     told us either thing. Replaced by a [bracketed] part only they can write.
//   - "My goal is N tournaments this season, and I'm happy to send the
//     schedule once it's set." `tournaments_goal` is NOT something the player
//     entered: signup writes a hardcoded 12 (lib/auth.ts) on top of a column
//     default of 12 (migration 001), and no screen lets anyone change it. Every
//     player's email said "My goal is 12 tournaments this season".
//   - "I've played N tournaments so far this season." `tournaments_played`
//     has the same problem: column default 0 and no screen writes it.
//   - "{school} is high on my list." Overstated; the stored fact is that the
//     player picked it as a target school, so that is what the email says.
//   - "Right now I'm working on {areas}." The stored fact is the player's
//     answer to onboarding's "What do you want to improve?" (profiles.weaknesses),
//     so the sentence now says that, not that they are working on it today.
export const COACH_EMAIL_SOURCES = [
  "player.name", //                profiles.name
  "player.graduationYear", //      profiles.graduation_year (grade is derived from it)
  "player.gender", //              profiles.gender
  "player.country", //             profiles.country
  "player.currentUTR", //          profiles.current_utr, self-reported
  "utr_entries.recorded_at", //    the date the player logged that rating
  "player.targetSchoolSlugs", //   profiles.target_school_slugs, picked by the player
  "player.weaknesses", //          profiles.weaknesses, onboarding "What do you want to improve?"
  "matches", //                    the player's own logged match results
  "school.name",
  "school.division",
  "school.conference",
  "placeholder", //                a [bracketed] part only the player can write
  "courtesy", //                   one of COACH_EMAIL_COURTESY_SENTENCES: asserts no fact
] as const;

export type CoachEmailSource = (typeof COACH_EMAIL_SOURCES)[number];

export interface CoachEmailPart {
  text: string;
  sources: readonly CoachEmailSource[];
}

/** The only sentences allowed to carry the "courtesy" source. Each one is a
 * greeting, a request or a thank-you — none states a fact about anybody. A
 * new courtesy sentence goes here, verbatim, or the test fails. */
export const COACH_EMAIL_COURTESY_SENTENCES = [
  "Coach,",
  "I'd welcome the chance to tell you more about my game and to hear what you look for in a recruit.",
  "Thank you for your time.",
] as const;

/** Visible stand-ins for what Seeded cannot know. Copy and "Open in Gmail"
 * stay disabled until every one is replaced (coachEmailActionState). */
export const COACH_EMAIL_PLACEHOLDERS = {
  whySchool: "[One sentence about why this school]",
  result: "[A recent result you're proud of: tournament, round and date]",
  name: "[Your name]",
} as const;

/**
 * The player's name as the coach email may use it, or null when there is no
 * usable one. QA sweep H2: a blank profiles.name loads as the login EMAIL
 * (lib/auth.ts mapProfileToPlayer falls back to it), and the draft then read
 * "I'm someone@example.com, …" in an email a minor signs. Blank, or anything
 * shaped like an email address, is not a name: the draft shows
 * COACH_EMAIL_PLACEHOLDERS.name instead, which keeps Copy / Gmail disabled
 * (coachEmailActionState) until the player types their name.
 */
export function coachEmailName(name: string | null | undefined): string | null {
  const t = (name ?? "").trim();
  if (!t || t.includes("@")) return null;
  return t;
}

export interface CoachEmail {
  subject: string;
  body: string;
  /** Every piece of the subject, with its sources. `subject` is these joined. */
  subjectParts: CoachEmailPart[];
  /** Every sentence and line of the body, with its sources, in order. `body`
   * is exactly these plus whitespace — nothing reaches it any other way. */
  parts: CoachEmailPart[];
}

export interface CoachEmailResult {
  name: string;
  level: string;
  result: string;
  /** The logged match date ("YYYY-MM-DD"). Optional: without it the sentence
   * simply names the event, never "this season". */
  date?: string;
}

export interface CoachEmailOptions {
  /** `utr_entries.recorded_at` of the entry that IS the player's current
   * rating. Pass it only when that entry's value equals `currentUTR`; a date
   * attached to a different number would be a false statement. */
  utrRecordedAt?: string | null;
}

// Plain restatements of the focus areas the player actually picked during
// onboarding. These used to be far more colorful ("turning my forehand into a
// genuine point-ending shot from the ad corner", "flattening my backhand to
// take time away on the deuce side") — but the player never said any of that.
// They ticked "forehand". Keep these a direct rendering of the selection and
// nothing more; the player can add their own detail before sending.
export const WEAKNESS_PHRASES: Record<string, string> = {
  forehand: "my forehand",
  backhand: "my backhand",
  serve: "my serve",
  fitness: "my fitness",
  mental: "the mental side of my game",
};

function part(text: string, ...sources: CoachEmailSource[]): CoachEmailPart {
  return { text, sources };
}

// Builds a recruiting email draft. See the header of this section for the
// rule and for what was removed; do not add a sentence here without a source.
export function buildCoachEmail(
  player: Player,
  school: School,
  results: CoachEmailResult[] = [],
  options: CoachEmailOptions = {}
): CoachEmail {
  const programType = player.gender === "female" ? "women's" : "men's";
  const isTarget = player.targetSchoolSlugs.includes(school.slug);

  // A UTR the player never entered must not appear in an email they sign.
  // `currentUTR <= 0` is this codebase's "not logged yet" convention. When it
  // is unknown the sentence, the subject fragment and the signature line are
  // all omitted. Two decimals, exactly as logged (C10): 5.95 went to coaches
  // as "6.0" once.
  const utrKnown = Number.isFinite(player.currentUTR) && player.currentUTR > 0;
  const utr = utrKnown ? `${formatPlayerUtr(player.currentUTR)} (self-reported)` : null;
  const utrDate = utr && options.utrRecordedAt ? formatDate(options.utrRecordedAt) : null;

  /* subject */
  const subjectParts: CoachEmailPart[] = [
    part(`${player.graduationYear} ${programType} recruit`, "player.graduationYear", "player.gender"),
  ];
  if (utr) subjectParts.push(part(`UTR ${utr}`, "player.currentUTR"));
  // Never an email address where the name goes (coachEmailName). Without a
  // usable name the subject and signature carry the [Your name] stand-in and
  // the intro simply omits it.
  const playerName = coachEmailName(player.name);
  const namePart = (): CoachEmailPart =>
    playerName ? part(playerName, "player.name") : part(COACH_EMAIL_PLACEHOLDERS.name, "placeholder");
  subjectParts.push(namePart());
  const subjectTail = isTarget
    ? part(`interested in ${school.shortName}`, "school.name", "player.targetSchoolSlugs")
    : part(school.shortName, "school.name");
  const subject =
    subjectParts.map((p) => p.text).join(" · ") + ` — ${subjectTail.text}`;
  subjectParts.push(subjectTail);

  /* body, one paragraph per array */
  const paragraphs: CoachEmailPart[][] = [];

  paragraphs.push([part("Coach,", "courtesy")]);

  // Grade is derived from graduation_year and today's date, never stored.
  const grade = ordinalGrade(getCurrentGrade(player.graduationYear));
  const article = /^(8|11|18)\D/.test(grade) ? "an" : "a"; // "an 11th-grade", not "a 11th-grade"
  const intro: CoachEmailPart[] = [
    part(
      `I'm ${playerName ? `${playerName}, ` : ""}${article} ${grade}-grade ${programType} player (class of ${player.graduationYear})${
        player.country && player.country !== "United States" ? ` from ${player.country}` : ""
      }.`,
      ...(playerName ? (["player.name"] as const) : []),
      "player.graduationYear",
      "player.gender",
      ...(player.country && player.country !== "United States" ? (["player.country"] as const) : [])
    ),
  ];
  // "One of my target schools" only when the player actually picked it.
  intro.push(
    isTarget
      ? part(
          `I'm reaching out because ${school.shortName} is one of my target schools.`,
          "school.name",
          "player.targetSchoolSlugs"
        )
      : part(`I'm reaching out about ${school.shortName}.`, "school.name")
  );
  paragraphs.push(intro);

  // Why this program: only the player knows. A visible bracket, not a guess.
  paragraphs.push([part(COACH_EMAIL_PLACEHOLDERS.whySchool, "placeholder")]);

  // Results, strictly from what the player logged. One sentence per result so
  // each carries its own source. With nothing logged: a bracket, never a
  // characterization of a season the player didn't describe.
  const resultParts: CoachEmailPart[] = results.slice(0, 2).map((r) => {
    const event = [r.level, r.name].filter(Boolean).join(" ");
    const when = r.date ? ` on ${formatDate(r.date)}` : "";
    return part(`At the ${event}${when}, I ${describeResult(r.result)}.`, "matches");
  });
  if (resultParts.length === 0) {
    resultParts.push(part(COACH_EMAIL_PLACEHOLDERS.result, "placeholder"));
  }
  // The player's own UTR, labelled, and dated when we know the date. Never
  // compared to the program's "competitive line": that number is an
  // unverified estimate of ours (UTR_RANGE_SOURCE_LABEL).
  if (utr) {
    resultParts.push(
      utrDate
        ? part(`My UTR is ${utr}, as of ${utrDate}.`, "player.currentUTR", "utr_entries.recorded_at")
        : part(`My UTR is ${utr}.`, "player.currentUTR")
    );
  }
  paragraphs.push(resultParts);

  // What the player said they want to improve — only when they picked areas.
  const focus = player.weaknesses.map((w) => WEAKNESS_PHRASES[w]).filter(Boolean);
  const closing: CoachEmailPart[] = [];
  if (focus.length > 0) {
    closing.push(part(`I want to improve ${joinList(focus)}.`, "player.weaknesses"));
  }
  closing.push(part(COACH_EMAIL_COURTESY_SENTENCES[1], "courtesy"));
  paragraphs.push(closing);

  paragraphs.push([part(COACH_EMAIL_COURTESY_SENTENCES[2], "courtesy")]);

  // Signature: one part per line.
  const signature: CoachEmailPart[] = [namePart()];
  signature.push(
    utr
      ? part(`UTR ${utr} · Class of ${player.graduationYear}`, "player.currentUTR", "player.graduationYear")
      : part(`Class of ${player.graduationYear}`, "player.graduationYear")
  );

  const body = [
    ...paragraphs.map((p) => p.map((x) => x.text).join(" ")),
    signature.map((x) => x.text).join("\n"),
  ].join("\n\n");

  return {
    subject,
    body,
    subjectParts,
    parts: [...paragraphs.flat(), ...signature],
  };
}

/* ------------------------------------------- copy / "Open in Gmail" gating */

const BRACKET = /\[[^\]\n]*\]/g;

/** Every [bracketed] span still in the draft, in order — plus any stray
 * "[" or "]" left behind when only one end of a placeholder was deleted
 * ("[One sentence about why this school" would otherwise reach the coach).
 * A stray bracket is reported as the text from it to the end of its line. */
export function bracketedParts(text: string): string[] {
  const whole = text.match(BRACKET) ?? [];
  const rest = text.replace(BRACKET, "");
  const stray = rest.match(/\[[^\n]*|[^\n]*\]/g) ?? [];
  return [...whole, ...stray.map((t) => t.trim()).filter(Boolean)];
}

export interface CoachEmailActionState {
  /** Copy: the draft must be complete. */
  copy: { enabled: boolean; reason: string | null };
  /** Open in Gmail: the draft must be complete AND have a valid address. */
  gmail: { enabled: boolean; reason: string | null };
  /** The bracketed parts still waiting to be replaced. */
  unresolved: string[];
}

/**
 * The ONE place that decides whether a draft may leave Seeded. Both buttons
 * (Copy and Open in Gmail) read it,
 * and both handlers re-check it before acting, so a disabled-attribute bug
 * cannot ship a bracket to a coach.
 */
export function coachEmailActionState(input: {
  subject: string;
  body: string;
  recipientValid?: boolean;
}): CoachEmailActionState {
  const unresolved = [...bracketedParts(input.subject), ...bracketedParts(input.body)];
  let draftReason: string | null = null;
  if (input.body.trim().length === 0) {
    draftReason = "Write a message first.";
  } else if (unresolved.length > 0) {
    const n = unresolved.length;
    draftReason =
      n === 1
        ? "Replace the part in [brackets] first, or delete it."
        : `Replace the ${n} parts in [brackets] first, or delete the ones you don't want to send.`;
  }
  const gmailReason =
    draftReason ??
    (input.recipientValid ? null : "Paste the coach's email in To to open Gmail.");
  return {
    copy: { enabled: draftReason === null, reason: draftReason },
    gmail: { enabled: gmailReason === null, reason: gmailReason },
    unresolved,
  };
}

function describeResult(result: string): string {
  const r = result.toLowerCase();
  if (r.startsWith("beat")) return result; // already a full phrase, keep casing
  if (r.includes("champion") || r.includes("won")) return "won the title";
  if (r.includes("final")) return "reached the final";
  if (r.includes("semi")) return "made the semifinals";
  if (r.includes("quarter")) return "reached the quarterfinals";
  if (r.includes("round of 16") || r.includes("r16")) return "reached the round of 16";
  if (r === "win" || r === "wins") return "picked up a win";
  return result.toLowerCase();
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
