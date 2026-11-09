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

// Lighter catalog for pages that list/compare/filter schools but never
// render recruit history or the coach-email program blurb — see SchoolLite.
export async function getSchoolsLite(): Promise<SchoolLite[]> {
  return resolve(schoolsData.map(({ recentRecruits, programNote, ...rest }) => rest));
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

function lastName(full: string): string {
  return full.trim().split(/\s+/).slice(-1)[0];
}

// Builds a personalized recruiting email. Pulls specifics from the player's
// real recent results and from the program (conference standing, recruiting
// footprint, competitive line) so it reads as researched, not templated.
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

  // 2) A specific, researched line about the program.
  const recruitFootprint = programFootprint(school);
  const programSentence = `I've been following ${school.shortName} closely — your ${ordinalRank(
    school.conferenceRank
  )}-place standing in the ${school.conference}${
    school.programNote ? `, and ${lowerFirst(school.programNote)}` : ""
  } is exactly the level I want to be pushing toward.${
    recruitFootprint ? ` ${recruitFootprint}` : ""
  }`;

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

  const body = `Coach ${lastName(school.coachName)},

I'm ${player.name}, a ${ordinalGrade(getCurrentGrade(player.graduationYear))}-grade ${programType} player (class of ${
    player.graduationYear
  })${player.country && player.country !== "United States" ? ` from ${player.country}` : ""}, and I'm reaching out because ${school.shortName} is high on my list.

${resultsSentence} ${fitSentence}

${programSentence}

${focusSentence ? focusSentence + " " : ""}I'd welcome the chance to send my full schedule and recent match footage, and to hear what you're prioritizing in the class of ${
    player.graduationYear
  }. I'll be at several events this spring and would be glad to play in front of your staff.

Thank you for your time, Coach ${lastName(school.coachName)}.

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

function programFootprint(school: School): string {
  const recruits = school.recentRecruits ?? [];
  const intl = recruits.filter((r) => !/,\s*[A-Z]{2}$/.test(r.hometown));
  if (intl.length > 0) {
    return `Your recent classes pull talent from everywhere — ${intl[0].hometown.split(",").slice(-1)[0].trim()} to the States — which tells me you build genuinely competitive lineups.`;
  }
  if (recruits.length > 0) {
    return `Bringing in players like your recent signees shows the kind of standard you recruit to.`;
  }
  return "";
}

function ordinalRank(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, "");
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
