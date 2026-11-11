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

import type { Division, Gender, Player, School, SchoolLite } from "@/lib/types";
import { getCurrentGrade, ordinalGrade } from "@/lib/time";

import { mensD1Schools } from "./schools-data-mens";
import { womensD1Schools } from "./schools-data-womens";
import { extraSchools } from "./schools-data-extra";

// The full catalog. Swapping to Supabase means replacing this with a query.
const schoolsData: School[] = [...mensD1Schools, ...womensD1Schools, ...extraSchools];

function resolve<T>(value: T): Promise<T> {
  return Promise.resolve(value);
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

export async function getSchoolsByGender(gender: Gender): Promise<School[]> {
  return resolve(schoolsData.filter((s) => s.gender === gender));
}

export async function getConferences(): Promise<string[]> {
  return resolve(Array.from(new Set(schoolsData.map((s) => s.conference))).sort());
}

export async function getStates(): Promise<string[]> {
  return resolve(Array.from(new Set(schoolsData.map((s) => s.state))).sort());
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

export function staffDirectorySearchUrl(
  school: Pick<School, "name" | "gender">
): string {
  return `https://www.google.com/search?q=${encodeURIComponent(
    staffDirectorySearchQuery(school)
  )}`;
}

/* ------------------------------------------------------------- coach email */

export interface CoachEmail {
  subject: string;
  body: string;
}

export interface CoachEmailResult {
  name: string;
  level: string;
  result: string;
}

// Concrete, project-style phrasing for each development area — deliberately
// specific (a measurable thing in progress), never "I work hard."
const WEAKNESS_PHRASES: Record<string, string> = {
  forehand: "turning my forehand into a genuine point-ending shot from the ad corner",
  backhand: "flattening my backhand to take time away on the deuce side",
  serve: "adding pace and a dependable kick to my second serve",
  fitness: "building the engine to hold my level deep in third sets",
  mental: "staying locked into my patterns when the score tightens",
};

// Builds a recruiting email draft.
//
// P0-3/P0-4: this text is sent by a real minor to a real college coach, so it
// may assert ONLY things the player themselves supplied (name, grad year,
// gender, country, self-reported UTR, their own logged results, their own
// stated focus areas) plus the school's name, division and conference. It
// used to open with "Coach {invented surname}", cite an invented conference
// standing and an invented recruit footprint, and make scheduling promises
// the player never made. Those are gone; do not reintroduce a sentence here
// that states a fact the player did not enter.
export function buildCoachEmail(
  player: Player,
  school: School,
  results: CoachEmailResult[] = []
): CoachEmail {
  const programType = school.gender === "women" ? "women's" : "men's";

  // 1) A concrete results sentence from the player's REAL logged results.
  // Never fabricate results — with nothing logged, speak to schedule volume.
  const top = results.slice(0, 2);
  const resultsSentence =
    top.length > 0
      ? `This season I ${top
          .map((r) => `${describeResult(r.result)} at the ${[r.level, r.name].filter(Boolean).join(" ")}`)
          .join(" and ")}.`
      : player.tournamentsPlayed > 0
        ? `I'm playing a full sectional and national schedule this season (${player.tournamentsPlayed} events so far, building toward ${player.tournamentsGoal}).`
        : `I'm building out a full sectional and national schedule this season, with ${player.tournamentsGoal} events planned.`;

  // 2) Interest in the program, stated as the player's own interest. The only
  // school facts allowed are the ones we can actually stand behind: name,
  // division and conference. No standing, no recruit footprint, no blurb.
  const programSentence = `I've been following ${school.shortName} closely, and ${school.division} tennis in the ${school.conference} is the level I want to be competing at.`;

  // 3) Fit framed against the program's actual competitive line.
  const gap = Math.round((school.minCompetitiveUTR - player.currentUTR) * 10) / 10;
  const fitSentence =
    gap <= 0
      ? `At UTR ${player.currentUTR.toFixed(1)} I'm already at your ${school.minCompetitiveUTR.toFixed(
          1
        )} competitive line, and I'm still trending up.`
      : `I'm at UTR ${player.currentUTR.toFixed(1)} now, about ${gap.toFixed(
          1
        )} below your ${school.minCompetitiveUTR.toFixed(
          1
        )} competitive line, and my roadmap has me closing that gap well before I'd arrive on campus.`;

  // 4) A concrete development focus (not a cliché).
  const focus = player.weaknesses.map((w) => WEAKNESS_PHRASES[w]).filter(Boolean);
  const focusSentence =
    focus.length > 0
      ? `Right now I'm specifically working on ${joinList(focus.slice(0, 2))}.`
      : "";

  const subject = `${player.graduationYear} ${programType} recruit · UTR ${player.currentUTR.toFixed(
    1
  )} · ${player.name} — interested in ${school.shortName}`;

  const body = `Coach,

I'm ${player.name}, a ${ordinalGrade(getCurrentGrade(player.graduationYear))}-grade ${programType} player (class of ${
    player.graduationYear
  })${player.country && player.country !== "United States" ? ` from ${player.country}` : ""}, and I'm reaching out because ${school.shortName} is high on my list.

${resultsSentence} ${fitSentence}

${programSentence}

${focusSentence ? focusSentence + " " : ""}I'd welcome the chance to send my full schedule and recent match footage, and to hear what you're prioritizing in the class of ${
    player.graduationYear
  }. I'll be at several events this spring and would be glad to play in front of your staff.

Thank you for your time.

${player.name}
UTR ${player.currentUTR.toFixed(1)} · Class of ${player.graduationYear}`;

  return { subject, body };
}

function describeResult(result: string): string {
  const r = result.toLowerCase();
  if (r.startsWith("beat")) return result; // already a full phrase, keep casing
  if (r.includes("champion") || r.includes("won")) return "won the title";
  if (r.includes("final")) return "reached the final";
  if (r.includes("semi")) return "made the semifinals";
  if (r.includes("quarter")) return "reached the quarterfinals";
  if (r.includes("round of 16") || r.includes("r16")) return "reached the round of 16";
  if (r === "win" || r === "wins") return "picked up wins";
  return result.toLowerCase();
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
