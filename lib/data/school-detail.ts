import type { School } from "@/lib/types";

// Rich, *derived* school profiles. Rather than hand-author rosters/results for
// 70 programs, we deterministically generate plausible, stable detail from each
// school's real fields (seeded by slug, so it never changes between renders).
// When wired to Supabase, replace getSchoolProfile with a real query.

export interface RosterPlayer {
  name: string;
  classYear: number;
  utr: number;
  position: number;
  hometown: string;
}

export interface MatchResult {
  opponent: string;
  result: "W" | "L";
  score: string;
  date: string;
  conference: boolean;
}

export interface StandingRow {
  team: string;
  isThis: boolean;
  confRecord: string;
  avgUTR: number;
}

export interface RecruitingClass {
  classYear: number;
  recruits: { name: string; hometown: string; utr: number }[];
}

export interface SchoolProfile {
  record: string;
  nationalRank: number;
  roster: RosterPlayer[];
  recentMatches: MatchResult[];
  standings: StandingRow[];
  recruitingClasses: RecruitingClass[];
  coachBio: string;
  campus: {
    isPublic: boolean;
    setting: string;
    enrollment: number;
    costInState: number;
    costOutState: number;
  };
  scholarships: { available: boolean; detail: string };
  deadlines: { earlyAction: string; regularDecision: string };
}

const PUBLIC_SLUGS = new Set([
  "virginia",
  "ucla",
  "texas",
  "florida",
  "georgia",
  "michigan",
  "ohio-state",
  "illinois",
  "nc-state",
  "north-carolina",
  "virginia-tech",
  "west-florida",
  "columbus-state",
]);

const MALE_FIRST = [
  "Liam", "Noah", "Ethan", "Mason", "Lucas", "Caleb", "Owen", "Henry", "Jack",
  "Theo", "Marco", "Diego", "Andres", "Felix", "Lars", "Tomas", "Stefan",
  "Pablo", "Niko", "Adrian", "Will", "Cole", "Reid", "Hugo", "Mateo",
];
const FEMALE_FIRST = [
  "Ava", "Mia", "Grace", "Harper", "Sofia", "Lucia", "Marta", "Elena", "Chiara",
  "Nina", "Reese", "Sloane", "Maya", "Ines", "Carla", "Greta", "Bianca",
  "Daria", "Saga", "Camila", "Clara", "Lena", "Zoe", "Paula", "Anneke",
];
const LAST = [
  "Carter", "Brooks", "Whitley", "Bianchi", "Park", "Tanaka", "Reyes", "Soto",
  "Klein", "Novak", "Petrov", "Walsh", "Bennett", "Mathers", "Delgado",
  "Holloway", "Frost", "Lane", "Sullivan", "Cross", "Vogel", "Berg", "Costa",
  "Lima", "Moretti", "Sato", "Andersson", "Horvat", "Mercer", "Doyle",
];
const HOMETOWNS = [
  "Charlotte, NC", "Irvine, CA", "Bethesda, MD", "Dallas, TX", "Atlanta, GA",
  "Madrid, Spain", "Munich, Germany", "Tokyo, Japan", "Buenos Aires, Argentina",
  "Prague, Czechia", "Sydney, Australia", "Toronto, Canada", "Miami, FL",
  "Chicago, IL", "Boston, MA", "London, UK", "Zagreb, Croatia", "Lyon, France",
];
const SETTINGS = [
  "Classic college town",
  "Suburban campus near a major city",
  "Urban campus in the heart of the city",
  "Leafy small-town campus",
];
const COACH_BG = [
  "a former tour-level professional",
  "a longtime assistant elevated to the top job",
  "an alum who once starred for the program",
  "a respected developer of pro-bound talent",
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getSchoolProfile(
  school: School,
  allSchools: School[]
): SchoolProfile {
  const rng = mulberry32(hash(school.slug));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

  const firstNames = school.gender === "women" ? FEMALE_FIRST : MALE_FIRST;

  // Roster: 9 players spread from just above avg down to just below min.
  const rosterSize = 9;
  const top = school.avgRosterUTR + 0.6;
  const bottom = school.minCompetitiveUTR - 0.2;
  const roster: RosterPlayer[] = Array.from({ length: rosterSize }, (_, i) => {
    const t = i / (rosterSize - 1);
    const utr = Math.round((top - (top - bottom) * t + (rng() - 0.5) * 0.3) * 10) / 10;
    return {
      name: `${pick(firstNames)} ${pick(LAST)}`,
      classYear: 2025 + intBetween(0, 3),
      utr,
      position: i + 1,
      hometown: pick(HOMETOWNS),
    };
  }).sort((a, b) => b.utr - a.utr).map((p, i) => ({ ...p, position: i + 1 }));

  // Conference standings: real catalog teams in the same conference + gender.
  const confTeams = allSchools
    .filter((s) => s.conference === school.conference && s.gender === school.gender)
    .sort((a, b) => b.avgRosterUTR - a.avgRosterUTR)
    .slice(0, 6);
  const standings: StandingRow[] = confTeams.map((s, i) => ({
    team: s.shortName,
    isThis: s.slug === school.slug,
    confRecord: `${10 - i}-${i + 1}`,
    avgUTR: s.avgRosterUTR,
  }));

  // Recent matches vs real same-gender opponents.
  const pool = allSchools.filter(
    (s) => s.gender === school.gender && s.slug !== school.slug
  );
  const recentMatches: MatchResult[] = Array.from({ length: 6 }, (_, i) => {
    const opp = pool[Math.floor(rng() * pool.length)];
    const edge = school.avgRosterUTR - opp.avgRosterUTR;
    const win = rng() < 0.5 + edge * 0.35;
    const close = Math.abs(edge) < 0.5;
    const score = win
      ? close ? "4-3" : pick(["4-1", "4-2", "4-0"])
      : close ? "3-4" : pick(["1-4", "2-4", "0-4"]);
    const month = ["Jan", "Feb", "Feb", "Mar", "Mar", "Apr"][i];
    return {
      opponent: opp.shortName,
      result: win ? "W" : "L",
      score,
      date: `${month} ${intBetween(3, 27)}`,
      conference: opp.conference === school.conference,
    };
  });
  const wins = recentMatches.filter((m) => m.result === "W").length;
  const record = `${12 + wins}-${6 + (recentMatches.length - wins)}`;

  // Recruiting classes: most recent uses real recruit data, plus two prior.
  const recruitingClasses: RecruitingClass[] = [
    {
      classYear: 2028,
      recruits: school.recentRecruits.map((r) => ({
        name: r.name,
        hometown: r.hometown,
        utr: r.utr,
      })),
    },
    ...[2027, 2026].map((year) => ({
      classYear: year,
      recruits: Array.from({ length: 2 + intBetween(0, 1) }, () => ({
        name: `${pick(firstNames)} ${pick(LAST)}`,
        hometown: pick(HOMETOWNS),
        utr:
          Math.round((school.minCompetitiveUTR + between(0, 1.2)) * 10) / 10,
      })),
    })),
  ];

  const tenure = intBetween(3, 16);
  const titles = intBetween(0, 6);
  const coachBio = `${school.coachName} is in their ${ordinal(
    tenure
  )} season at the helm of ${school.shortName}, arriving as ${pick(
    COACH_BG
  )}. They've guided the program to ${
    titles > 0 ? `${titles} ${school.conference} title${titles > 1 ? "s" : ""}` : "multiple postseason appearances"
  } and built a reputation for recruiting and developing players who compete at the top of the ${school.conference}.`;

  const isPublic = PUBLIC_SLUGS.has(baseSlug(school.slug));
  const enrollment = isPublic
    ? intBetween(22, 52) * 1000
    : school.division === "D3"
      ? intBetween(2, 9) * 1000
      : intBetween(6, 16) * 1000;
  const costInState = isPublic
    ? Math.round(between(28, 39))
    : Math.round(between(78, 90));
  const costOutState = isPublic
    ? Math.round(between(50, 62))
    : costInState;

  const scholarships =
    school.division === "D3"
      ? {
          available: false,
          detail:
            "No athletic scholarships (Division III). Strong academic and need-based aid is typically available.",
        }
      : {
          available: true,
          detail:
            school.gender === "women"
              ? "Athletic scholarships available — women's tennis is fully funded at up to 8 equivalencies."
              : "Athletic scholarships available — men's tennis is an equivalency sport (up to 4.5 split across the roster).",
        };

  // National rank within the catalog (same gender + division) by combined fit.
  const peers = allSchools
    .filter((s) => s.gender === school.gender && s.division === school.division)
    .sort((a, b) => combinedScore(b) - combinedScore(a));
  const nationalRank = peers.findIndex((s) => s.slug === school.slug) + 1;

  return {
    record,
    nationalRank,
    roster,
    recentMatches,
    standings,
    recruitingClasses,
    coachBio,
    campus: {
      isPublic,
      setting: pick(SETTINGS),
      enrollment: Math.round(enrollment / 100) * 100,
      costInState,
      costOutState,
    },
    scholarships,
    deadlines: {
      earlyAction: "Nov 1 (Early Action)",
      regularDecision: school.division === "D1" ? "Jan 5 (Regular Decision)" : "Jan 15 (Regular Decision)",
    },
  };
}

function baseSlug(slug: string): string {
  return slug.replace(/-(m|w)$/, "");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Blend of academics (US News) and tennis level (avg roster UTR), 0-100.
// Exported for the leaderboard's "combined score" sort.
export function combinedScore(school: School): number {
  const academic = Math.max(0, 100 - school.usNewsRanking * 0.62);
  const tennis = Math.min(100, (school.avgRosterUTR / 12.5) * 100);
  return Math.round(academic * 0.5 + tennis * 0.5);
}
