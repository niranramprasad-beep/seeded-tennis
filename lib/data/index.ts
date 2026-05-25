// Single data-access surface for the app.
//
// Components NEVER import the raw arrays directly — they call these functions.
// Today the functions resolve in-memory TypeScript. To move to Supabase later,
// replace the bodies here with queries (e.g. `supabase.from('schools').select()`)
// and the rest of the app keeps working unchanged.

import type {
  Division,
  Gender,
  Player,
  RoadmapYear,
  School,
  Testimonial,
  Tournament,
  TrainingPlan,
} from "@/lib/types";

import { mensD1Schools } from "./schools";
import { womensD1Schools } from "./schools-womens";
import { extraSchools } from "./schools-extra";
import { getSchoolProfile, combinedScore } from "./school-detail";
import { trainingPlans as trainingPlansData } from "./training-plans";
import { tournaments as tournamentsData } from "./tournaments";
import { testimonials as testimonialsData } from "./testimonials";
import { sampledPlayer, blankPlayer } from "./user";

// The full catalog. Swapping to Supabase means replacing this with a query.
const schoolsData: School[] = [
  ...mensD1Schools,
  ...womensD1Schools,
  ...extraSchools,
];

// Resolve as a promise so call sites already `await`, matching a real client.
function resolve<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

/* ----------------------------------------------------------------- schools */

export async function getSchools(): Promise<School[]> {
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

// Re-export the rich-detail derivation + combined-score helper.
export { getSchoolProfile, combinedScore };
export type {
  SchoolProfile,
  RosterPlayer,
  MatchResult,
  StandingRow,
  RecruitingClass,
} from "./school-detail";

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

/* --------------------------------------------------------------- training */

export async function getTrainingPlans(): Promise<TrainingPlan[]> {
  return resolve(trainingPlansData);
}

export async function getTrainingPlanForUTR(utr: number): Promise<TrainingPlan> {
  const nearest = trainingPlansData.reduce((best, plan) =>
    Math.abs(plan.utrLevel - utr) < Math.abs(best.utrLevel - utr) ? plan : best
  );
  return resolve(nearest);
}

/* ------------------------------------------------------------- tournaments */

export async function getTournaments(): Promise<Tournament[]> {
  return resolve(
    [...tournamentsData].sort((a, b) => a.date.localeCompare(b.date))
  );
}

/* ------------------------------------------------------------ testimonials */

export async function getTestimonials(): Promise<Testimonial[]> {
  return resolve(testimonialsData);
}

/* ------------------------------------------------------------------ player */

export async function getSamplePlayer(): Promise<Player> {
  return resolve(sampledPlayer);
}

export async function getBlankPlayer(): Promise<Player> {
  return resolve(blankPlayer);
}

/* ---------------------------------------------------------------- roadmap */

// Milestones are framed around the SUMMER BEFORE the given grade — the window
// that actually matters for recruiting. Keyed by the grade the summer precedes
// (13 = the summer before college / freshman year).
const MILESTONES_BEFORE_GRADE: Record<number, string[]> = {
  9: [
    "Lock in a year-round training base",
    "Bank 6+ sectional results before the season",
    "Have a dependable second serve",
  ],
  10: [
    "Be a fixture in sectional L4-L5 main draws",
    "Own one weapon you can win points with",
    "Start a realistic target-school shortlist",
  ],
  11: [
    "Be ready for 2+ national L1/L2 events this year",
    "NCAA contact opens June 15 — have your email ready",
    "Take unofficial visits to top-choice campuses",
  ],
  12: [
    "Hit your competitive UTR before junior-summer showcases",
    "Send personalized notes to target coaches",
    "Convert interest into official-visit invitations",
  ],
  13: [
    "Lock in your verbal commitment",
    "Hold your UTR through the signing window",
    "Arrive on campus physically college-ready",
  ],
};

function ordinal(grade: number): string {
  const map: Record<number, string> = {
    8: "8th",
    9: "9th",
    10: "10th",
    11: "11th",
    12: "12th",
  };
  return map[grade] ?? `${grade}th`;
}

// Pure derivation. Given a player and their resolved target schools, produce a
// checkpoint-by-checkpoint UTR roadmap. Each checkpoint is the SUMMER BEFORE a
// grade (the recruiting-relevant window), and the goal UTR is the highest
// minimum-competitive bar among the targets — already gender-correct because the
// targets come from the matching men's/women's program data.
export function buildRoadmap(player: Player, targets: School[]): RoadmapYear[] {
  const genderCap = player.gender === "female" ? 11.5 : 12.5;
  const goalUTR =
    targets.length > 0
      ? Math.max(...targets.map((s) => s.minCompetitiveUTR))
      : Math.min(player.currentUTR + 2.5, genderCap);

  const startGrade = Math.min(player.grade, 12);

  // Upcoming summers: before each remaining grade, plus before college (13).
  const grades: number[] = [];
  for (let g = startGrade + 1; g <= 12; g++) grades.push(g);
  grades.push(13);

  const total = grades.length;
  return grades.map((g, i) => {
    const fraction = (i + 1) / total;
    const utrTarget =
      Math.round((player.currentUTR + (goalUTR - player.currentUTR) * fraction) * 10) /
      10;
    // Summer before grade g falls in this calendar year.
    const calendarYear = player.graduationYear - 13 + g;
    const tournamentsNeeded = g === 13 ? 6 : 10 + i * 2;
    const isCollege = g === 13;

    return {
      calendarYear,
      gradeLabel: isCollege
        ? "By summer before college"
        : `By summer before ${ordinal(g)} grade`,
      shortLabel: isCollege ? "College" : `${ordinal(g)}`,
      utrTarget,
      tournamentsNeeded,
      milestones: MILESTONES_BEFORE_GRADE[g] ?? [
        "Keep building your UTR steadily",
        "Stay active on the tournament circuit",
        "Refine your school shortlist",
      ],
    };
  });
}

export async function getRoadmap(
  player: Player,
  overrideSlugs?: string[]
): Promise<RoadmapYear[]> {
  const slugs = overrideSlugs ?? player.targetSchoolSlugs;
  const targets = await getSchoolsBySlugs(slugs);
  return resolve(buildRoadmap(player, targets));
}

/* ------------------------------------------------------- coach email gen */

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

  // 1) A concrete results sentence from real tournament data.
  const top = results.slice(0, 2);
  const resultsSentence =
    top.length > 0
      ? `This season I ${top
          .map((r) => `${describeResult(r.result)} at the ${r.level} ${r.name}`)
          .join(" and ")}.`
      : `I'm playing a full sectional and national schedule this season (${player.tournamentsPlayed} events so far, building toward ${player.tournamentsGoal}).`;

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

I'm ${player.name}, a ${ordinal(player.grade)}-grade ${programType} player (class of ${
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
  if (r.includes("champion") || r.includes("won")) return "won the title";
  if (r.includes("final")) return "reached the final";
  if (r.includes("semi")) return "made the semifinals";
  if (r.includes("quarter")) return "reached the quarterfinals";
  if (r.includes("round of 16") || r.includes("r16")) return "reached the round of 16";
  return result.toLowerCase();
}

function programFootprint(school: School): string {
  const recruits = school.recentRecruits ?? [];
  const intl = recruits.filter((r) => !/,\s*[A-Z]{2}$/.test(r.hometown));
  if (intl.length > 0) {
    return `Your recent classes pull talent from everywhere — ${intl[0].hometown.split(",").slice(-1)[0].trim()} to the States — which tells me you build genuinely competitive lineups.`;
  }
  if (recruits.length > 0) {
    return `Bringing in players like your class of ${recruits[0].classYear} shows the kind of standard you recruit to.`;
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
