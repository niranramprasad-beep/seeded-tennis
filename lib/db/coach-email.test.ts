import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  bracketedParts,
  buildCoachEmail,
  coachEmailActionState,
  COACH_EMAIL_COURTESY_SENTENCES,
  COACH_EMAIL_PLACEHOLDERS,
  COACH_EMAIL_SOURCES,
  WEAKNESS_PHRASES,
  type CoachEmail,
  type CoachEmailOptions,
  type CoachEmailPart,
  type CoachEmailResult,
  type CoachEmailSource,
} from "./schools";
import { emptyPlayer } from "@/lib/data/user";
import { formatDate, getCurrentGrade } from "@/lib/time";
import { formatPlayerUtr } from "@/lib/utils";
import type { Player, School, Weakness } from "@/lib/types";

// D3 (2026-11-19). The owner's audit found the coach email asserting things
// nothing stored backs: "I've been following {school} closely", "My goal is
// 12 tournaments this season" (a hardcoded signup default, the same for every
// player), "I've played N tournaments" (a column no screen writes). This file
// is the structural guard: the draft is built from PARTS, each part names its
// sources, and every assertion below is about the parts, not about phrasing
// someone might reword around.

const school: School = {
  id: "1",
  slug: "fake-state-w",
  name: "Fake State University",
  shortName: "Fake State",
  city: "Springfield",
  state: "ZZ",
  conference: "Fake Athletic Conference",
  division: "D1",
  gender: "women",
  primaryColor: "#000",
  secondaryColor: "#fff",
  textColor: "#fff",
  avgRosterUTR: 11.37,
  minCompetitiveUTR: 10.21,
  usNewsRanking: 43,
};

const base: Player = {
  ...emptyPlayer,
  name: "Test Player",
  gender: "female",
  graduationYear: 2028,
  currentUTR: 9.42,
  targetSchoolSlugs: [school.slug],
  weaknesses: ["serve", "fitness"],
  // A distinctive value so any leak into the draft is visible. Since 049
  // the player CAN enter this, but the draft still does not state it (D3).
  tournamentsPlanned: 7,
};

const results: CoachEmailResult[] = [
  { name: "Fake Winter Open", level: "L4", result: "Champion", date: "2026-01-04" },
  { name: "Fake Spring Classic", level: "", result: "beat a UTR 10.05 opponent", date: "2026-03-29" },
];

interface Case {
  label: string;
  player: Player;
  results: CoachEmailResult[];
  options: CoachEmailOptions;
}

// A matrix wide enough to hit every branch of the builder.
const cases: Case[] = [];
for (const currentUTR of [9.42, 0, Number.NaN]) {
  for (const res of [[], results.slice(0, 1), results]) {
    for (const weaknesses of [[], ["mental"], ["forehand", "backhand", "serve"]] as Weakness[][]) {
      for (const targeted of [true, false]) {
        for (const utrRecordedAt of [null, "2026-11-02"]) {
          for (const country of ["United States", "Canada"]) {
            cases.push({
              label: `utr=${currentUTR} results=${res.length} focus=${weaknesses.length} target=${targeted} dated=${Boolean(
                utrRecordedAt
              )} ${country}`,
              player: {
                ...base,
                currentUTR,
                weaknesses,
                country,
                gender: country === "Canada" ? "male" : "female",
                targetSchoolSlugs: targeted ? [school.slug] : [],
              },
              results: res,
              options: { utrRecordedAt },
            });
          }
        }
      }
    }
  }
}

function build(c: Case): CoachEmail {
  return buildCoachEmail(c.player, school, c.results, c.options);
}

/** What each source looks like when it is rendered into text. A part that
 * claims a source must contain at least one of that source's renderings —
 * otherwise the label is decoration, not provenance. */
function evidenceFor(source: CoachEmailSource, c: Case): string[] {
  const p = c.player;
  switch (source) {
    case "player.name":
      return [p.name];
    case "player.graduationYear":
      return [String(p.graduationYear)];
    case "player.gender":
      return [p.gender === "female" ? "women's" : "men's"];
    case "player.country":
      return [p.country];
    case "player.currentUTR":
      return [`${formatPlayerUtr(p.currentUTR)} (self-reported)`];
    case "utr_entries.recorded_at":
      return c.options.utrRecordedAt ? [formatDate(c.options.utrRecordedAt)] : [];
    case "player.targetSchoolSlugs":
      return ["target school", "interested in"];
    case "player.weaknesses":
      return p.weaknesses.map((w) => WEAKNESS_PHRASES[w]);
    case "matches":
      return c.results.map((r) => r.name);
    case "school.name":
      return [school.shortName, school.name];
    case "school.division":
      return [school.division];
    case "school.conference":
      return [school.conference];
    case "placeholder":
    case "courtesy":
      return [];
  }
}

function allParts(e: CoachEmail): CoachEmailPart[] {
  return [...e.subjectParts, ...e.parts];
}

describe("every sentence of the coach email carries a source", () => {
  it("covers a real matrix of players", () => {
    expect(cases.length).toBeGreaterThan(100);
  });

  it("every part names at least one source, and only allowed ones", () => {
    const allowed = new Set<string>(COACH_EMAIL_SOURCES);
    for (const c of cases) {
      for (const p of allParts(build(c))) {
        expect(p.sources.length, `${c.label}: "${p.text}"`).toBeGreaterThan(0);
        for (const s of p.sources) expect(allowed.has(s), `${c.label}: ${s}`).toBe(true);
      }
    }
  });

  it("a courtesy part is one of the fixed fact-free sentences, verbatim, and stands alone", () => {
    const courtesy = new Set<string>(COACH_EMAIL_COURTESY_SENTENCES);
    for (const c of cases) {
      for (const p of allParts(build(c)).filter((x) => x.sources.includes("courtesy"))) {
        expect(courtesy.has(p.text), `${c.label}: "${p.text}"`).toBe(true);
        expect(p.sources).toEqual(["courtesy"]);
      }
    }
  });

  it("a placeholder part is exactly one of the known [bracketed] stand-ins", () => {
    const known = new Set<string>(Object.values(COACH_EMAIL_PLACEHOLDERS));
    for (const c of cases) {
      for (const p of allParts(build(c)).filter((x) => x.sources.includes("placeholder"))) {
        expect(known.has(p.text), `${c.label}: "${p.text}"`).toBe(true);
        expect(p.text).toMatch(/^\[[^\]]+\]$/);
        expect(p.sources).toEqual(["placeholder"]);
      }
    }
  });

  it("every declared data source is actually visible in its part's text", () => {
    for (const c of cases) {
      for (const p of allParts(build(c))) {
        for (const s of p.sources) {
          if (s === "placeholder" || s === "courtesy") continue;
          const ev = evidenceFor(s, c);
          expect(
            ev.some((v) => v && p.text.includes(v)),
            `${c.label}: "${p.text}" claims ${s} but shows none of ${JSON.stringify(ev)}`
          ).toBe(true);
        }
      }
    }
  });

  it("brackets appear ONLY in placeholder parts", () => {
    for (const c of cases) {
      for (const p of allParts(build(c))) {
        if (bracketedParts(p.text).length > 0) expect(p.sources).toEqual(["placeholder"]);
      }
    }
  });

  it("the body and subject are exactly their parts — no text reaches them any other way", () => {
    for (const c of cases) {
      const e = build(c);
      let body = e.body;
      for (const p of e.parts) {
        const at = body.indexOf(p.text);
        expect(at, `${c.label}: part not found in order: "${p.text}"`).toBeGreaterThanOrEqual(0);
        // consume in order, so a part can't be "found" in an earlier one
        expect(body.slice(0, at).trim(), `${c.label}: stray text before "${p.text}"`).toBe("");
        body = body.slice(at + p.text.length);
      }
      expect(body.trim(), c.label).toBe("");

      let subject = e.subject;
      for (const p of e.subjectParts) {
        const at = subject.indexOf(p.text);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(subject.slice(0, at).replace(/[·—\s]/g, "")).toBe("");
        subject = subject.slice(at + p.text.length);
      }
      expect(subject.trim()).toBe("");
    }
  });
});

describe("no untraceable sentence can appear", () => {
  // Each was in the draft before D3. None is backed by anything stored.
  const REMOVED: RegExp[] = [
    /following .{0,40}closely/i,
    /the level I want to be competing at/i,
    /My goal is \d+ tournaments?/i,
    /happy to send the schedule/i,
    /tournaments? so far this season/i,
    /I've played \d+/i,
    /high on my list/i,
    /Right now I'm working on/i,
    /This season I\b/i,
    /a full sectional and national schedule/i,
    /I'll be at several events/i,
    /play in front of your staff/i,
    /competitive line|closing that gap|my roadmap/i,
  ];

  it("none of the removed phrasings is ever generated", () => {
    for (const c of cases) {
      const e = build(c);
      const whole = `${e.subject}\n${e.body}`;
      for (const re of REMOVED) expect(re.test(whole), `${c.label}: ${re}`).toBe(false);
    }
  });

  it("tournaments planned has no effect on the draft", () => {
    const a = buildCoachEmail({ ...base, tournamentsPlanned: null }, school, []);
    const b = buildCoachEmail({ ...base, tournamentsPlanned: 30 }, school, []);
    expect(b).toEqual(a);
  });

  it("states no school fact beyond name, division and conference", () => {
    for (const c of cases) {
      const e = build(c);
      const whole = `${e.subject}\n${e.body}`;
      for (const v of [school.city, school.state, String(school.usNewsRanking)]) {
        expect(whole.includes(v), `${c.label}: ${v}`).toBe(false);
      }
      for (const v of [school.avgRosterUTR, school.minCompetitiveUTR]) {
        expect(whole.includes(formatPlayerUtr(v)), `${c.label}: ${v}`).toBe(false);
        expect(whole.includes(v.toFixed(1)), `${c.label}: ${v}`).toBe(false);
      }
    }
  });

  // The generic check: every number in the draft must be one the player
  // entered (UTR, grad year — and the grade derived from it), a logged
  // result's date or opponent rating, or the UTR entry's date. A new
  // sentence that puts any other number in a minor's mouth fails here.
  it("every number in the draft comes from the player's own data", () => {
    for (const c of cases) {
      const e = build(c);
      const allowed = new Set<string>([
        String(c.player.graduationYear),
        String(getCurrentGrade(c.player.graduationYear)),
      ]);
      if (c.player.currentUTR > 0) allowed.add(formatPlayerUtr(c.player.currentUTR));
      const dates = [...c.results.map((r) => r.date), c.options.utrRecordedAt].filter(Boolean) as string[];
      for (const d of dates) for (const n of formatDate(d).match(/\d+/g) ?? []) allowed.add(n);
      for (const r of c.results) for (const n of r.result.match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(n);
      for (const r of c.results) for (const n of r.level.match(/\d+/g) ?? []) allowed.add(n);
      const numbers = `${e.subject}\n${e.body}`.match(/\d+(?:\.\d+)?/g) ?? [];
      for (const n of numbers) expect(allowed.has(n), `${c.label}: unexplained number ${n}`).toBe(true);
    }
  });
});

describe("what the draft says, concretely", () => {
  it("dates the UTR when the entry date is known, and labels it self-reported", () => {
    const e = buildCoachEmail(base, school, [], { utrRecordedAt: "2026-11-02" });
    expect(e.body).toContain("My UTR is 9.42 (self-reported), as of Nov 2, 2026.");
    const undated = buildCoachEmail(base, school, []);
    expect(undated.body).toContain("My UTR is 9.42 (self-reported).");
  });

  it("dates each logged result instead of saying 'this season'", () => {
    const e = buildCoachEmail(base, school, results);
    expect(e.body).toContain("At the L4 Fake Winter Open on Jan 4, 2026, I won the title.");
    expect(e.body).toContain("At the Fake Spring Classic on Mar 29, 2026, I beat a UTR 10.05 opponent.");
    expect(e.body).not.toContain(COACH_EMAIL_PLACEHOLDERS.result);
  });

  it("asks for a result in [brackets] when none is logged, and always for why this school", () => {
    const e = buildCoachEmail(base, school, []);
    expect(e.body).toContain(COACH_EMAIL_PLACEHOLDERS.result);
    expect(e.body).toContain(COACH_EMAIL_PLACEHOLDERS.whySchool);
    expect(bracketedParts(e.body)).toHaveLength(2);
  });

  it("only calls a school a target when the player picked it", () => {
    const target = buildCoachEmail(base, school, []);
    expect(target.body).toContain("Fake State is one of my target schools.");
    expect(target.subject).toContain("interested in Fake State");
    const other = buildCoachEmail({ ...base, targetSchoolSlugs: [] }, school, []);
    expect(other.body).not.toMatch(/target school/);
    expect(other.subject).not.toMatch(/interested in/);
    expect(other.body).toContain("Fake State");
  });
});

describe("a draft with a [bracket] in it can never be copied or sent", () => {
  it("a fresh draft is blocked for both buttons, with the reason counting the parts", () => {
    const e = buildCoachEmail(base, school, []);
    const s = coachEmailActionState({ subject: e.subject, body: e.body, recipientValid: true });
    expect(s.copy.enabled).toBe(false);
    expect(s.gmail.enabled).toBe(false);
    expect(s.unresolved).toHaveLength(2);
    expect(s.copy.reason).toMatch(/^Replace the 2 parts in \[brackets\] first/);
    expect(s.gmail.reason).toBe(s.copy.reason);
  });

  it("one bracket left still blocks, with singular wording", () => {
    const e = buildCoachEmail(base, school, results);
    const s = coachEmailActionState({ subject: e.subject, body: e.body, recipientValid: true });
    expect(s.copy.enabled).toBe(false);
    expect(s.copy.reason).toMatch(/^Replace the part in \[brackets\] first/);
  });

  it("replacing every bracket unlocks Copy; Gmail also needs a valid address", () => {
    const e = buildCoachEmail(base, school, []);
    const body = e.body
      .replace(COACH_EMAIL_PLACEHOLDERS.whySchool, "I want to study engineering there.")
      .replace(COACH_EMAIL_PLACEHOLDERS.result, "");
    const noTo = coachEmailActionState({ subject: e.subject, body, recipientValid: false });
    expect(noTo.copy).toEqual({ enabled: true, reason: null });
    expect(noTo.gmail.enabled).toBe(false);
    expect(noTo.gmail.reason).toMatch(/email in To/);
    const withTo = coachEmailActionState({ subject: e.subject, body, recipientValid: true });
    expect(withTo.gmail).toEqual({ enabled: true, reason: null });
  });

  it("a bracket anywhere — subject, typed by the player, any length — blocks both", () => {
    const samples = ["[x]", "[]", "[ ]", "Hi [Coach name],", "see [link] and [video]", "[One sentence about why this school]"];
    for (const t of samples) {
      for (const where of ["subject", "body"] as const) {
        const s = coachEmailActionState({
          subject: where === "subject" ? t : "Subject",
          body: where === "body" ? `Coach,\n\n${t}\n\nThanks.` : "Coach, hello.",
          recipientValid: true,
        });
        expect(s.copy.enabled, `${where}: ${t}`).toBe(false);
        expect(s.gmail.enabled, `${where}: ${t}`).toBe(false);
      }
    }
  });

  it("an empty message blocks both", () => {
    const s = coachEmailActionState({ subject: "Hi", body: "   ", recipientValid: true });
    expect(s.copy.enabled).toBe(false);
    expect(s.gmail.enabled).toBe(false);
  });

  // Source-level: both composers' buttons read this one function, and both
  // handlers re-check it. A button wired to its own condition (the old
  // `disabled={!recipientValid}`) would let a bracketed draft out.
  it("both buttons in the Seeded composer, and the legacy Copy, use the shared gate", () => {
    const seeded = readFileSync("components/seeded/outreach/seeded-outreach-layout.tsx", "utf8");
    expect(seeded).toMatch(/coachEmailActionState\(\{ subject, body, recipientValid \}\)/);
    expect(seeded).toMatch(/disabled=\{!actions\.gmail\.enabled\}/);
    expect(seeded).toMatch(/if \(!actions\.gmail\.enabled\) return;/);
    expect(seeded).toMatch(/onClick=\{copyAll\}\s+disabled=\{!actions\.copy\.enabled\}/);
    expect(seeded).not.toMatch(/disabled=\{!recipientValid\}/);
    expect(seeded).toContain("https://mail.google.com/mail/?view=cm");

    const view = readFileSync("components/coaches/coaches-view.tsx", "utf8");
    expect(view).toMatch(/if \(!coachEmailActionState\(\{ subject, body \}\)\.copy\.enabled\) return;/);
    expect(view).toMatch(/disabled=\{!draftActions\.copy\.enabled\}/);
    // No other path writes the draft to the clipboard or opens Gmail.
    expect(view.match(/clipboard\.writeText/g)).toHaveLength(1);
    expect(view).not.toContain("mail.google.com");
  });
});

describe('"New email" works for every target school', () => {
  it("lists every target school and writes no outreach row when picked", () => {
    const seeded = readFileSync("components/seeded/outreach/seeded-outreach-layout.tsx", "utf8");
    // The old picker listed only schools with no row and was disabled once
    // every target had one.
    expect(seeded).not.toMatch(/notStarted/);
    const picker = seeded.slice(seeded.indexOf('id="outreach-new-email-picker"'));
    expect(picker).toMatch(/targetSchools\.map/);
    const onPick = picker.slice(0, picker.indexOf("</button>"));
    expect(onPick).toMatch(/startNewEmail\(s\.slug\)/);
    expect(onPick).not.toMatch(/setStatus\(/);
  });
});

describe("coach email gate: half-deleted placeholders (PR D review)", () => {
  it("blocks a stray opening bracket", () => {
    const s = coachEmailActionState({ subject: "Hi", body: "Hello. [One sentence about why this school\nThanks.", recipientValid: true });
    expect(s.copy.enabled).toBe(false);
    expect(s.gmail.enabled).toBe(false);
  });
  it("blocks a stray closing bracket", () => {
    const s = coachEmailActionState({ subject: "Hi", body: "Hello. why this school]\nThanks.", recipientValid: true });
    expect(s.copy.enabled).toBe(false);
  });
  it("allows a draft with no brackets", () => {
    const s = coachEmailActionState({ subject: "Hi", body: "Hello coach.\nThanks.", recipientValid: true });
    expect(s.copy.enabled).toBe(true);
    expect(s.gmail.enabled).toBe(true);
  });
});

// QA sweep 2026-11-20, H2: a blank profiles.name loads as the login email
// (lib/auth.ts), and the draft read "I'm demo-player@example.com, …".
describe("coach email: never an email address (or nothing) where the name goes", () => {
  for (const name of ["", "   ", "demo-player@example.com", " someone@example.org "]) {
    it(`name=${JSON.stringify(name)} → [Your name] in subject and signature, none in the intro`, () => {
      const e = buildCoachEmail({ ...base, name }, school, results);
      expect(e.subject).not.toContain("@");
      expect(e.body).not.toContain("@");
      expect(e.subject).toContain(COACH_EMAIL_PLACEHOLDERS.name);
      expect(e.body.trimEnd().split("\n").slice(-2)[0]).toBe(COACH_EMAIL_PLACEHOLDERS.name);
      expect(e.body).toMatch(/^I'm an? \d+\w*-grade /m);
      for (const p of [...e.subjectParts, ...e.parts]) {
        expect(p.sources).not.toContain("player.name");
        if (bracketedParts(p.text).length > 0) expect(p.sources).toEqual(["placeholder"]);
      }
      // The bracket keeps Copy and Gmail disabled until the player types it.
      const gate = coachEmailActionState({ subject: e.subject, body: e.body, recipientValid: true });
      expect(gate.copy.enabled).toBe(false);
      expect(gate.gmail.enabled).toBe(false);
      expect(gate.unresolved).toContain(COACH_EMAIL_PLACEHOLDERS.name);
    });
  }

  it("a real name is used as typed (trimmed), with no stand-in", () => {
    const e = buildCoachEmail({ ...base, name: "  Sam R. " }, school, results);
    expect(e.subject).toContain("Sam R.");
    expect(e.body).toContain("I'm Sam R., ");
    expect(e.body).not.toContain(COACH_EMAIL_PLACEHOLDERS.name);
  });
});
