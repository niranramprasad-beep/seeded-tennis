import { describe, expect, it } from "vitest";
import {
  LOGGED_PACE_MAX_MONTHS,
  LOGGED_PACE_MIN_MONTHS,
  LOGGED_PACE_YEAR_AGO_FROM_MONTHS,
  buildFitReport,
  formatPacePerMonth,
  loggedPaceAssumption,
  loggedPaceFor,
  projectUtrAtRecruiting,
  projectedUtrOn,
  projectionAssumptionLabel,
  projectionReachDate,
  projectionTargetDate,
  recruitingTimeUtr,
  utrHistoryFromEntries,
  yearsUntilRecruiting,
} from "./fit";
import { REALISTIC_UTR_CEILING } from "./config/recruiting";
import { localMonthsBetween } from "./time";
import { realisticPaceProjectionFor, whatIfProjectionFor } from "./what-if-utr";
import type { UtrDataPoint } from "./utr-projection";

// recruitingTimeUtr's one rule (docs/DECISIONS.md, 2026-11-18, "One
// projection rule for onboarding and the app"):
//   1. summer before senior year begun → today's rating
//   2. a REAL logged rating 5–13 months old → the player's own pace
//   3. otherwise → the typical-growth estimate

const NOW = new Date(2026, 10, 18, 12, 0, 0); // Wed Nov 18 2026, local noon
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const pt = (y: number, m: number, d: number, utr: number): UtrDataPoint => ({ date: day(y, m, d), utr });
const base = { currentUtr: 8, graduationYear: 2030, gender: "male" as const, now: NOW };
const monthsToTarget = yearsUntilRecruiting(2030, NOW) * 12;

describe("the window constants", () => {
  it("are the documented 5 / 9 / 13 months", () => {
    expect([LOGGED_PACE_MIN_MONTHS, LOGGED_PACE_YEAR_AGO_FROM_MONTHS, LOGGED_PACE_MAX_MONTHS]).toEqual([5, 9, 13]);
  });
});

describe("rule 1: the summer before senior year has begun", () => {
  it("today's rating, even with a qualifying logged rating", () => {
    const r = recruitingTimeUtr({ ...base, graduationYear: 2027, history: [pt(2025, 11, 18, 6)] })!;
    expect(r.source).toBe("current");
    expect(r.value).toBe(8);
    expect(r.isProjected).toBe(false);
    expect(r.assumption).toBeNull();
  });
});

describe("rule 2: the player's own logged pace", () => {
  it("year-ago rating: (today − past) / months, carried to June 1 of grad − 1, one value", () => {
    const r = recruitingTimeUtr({ ...base, history: [pt(2025, 11, 18, 7)] })!;
    expect(r.source).toBe("logged-pace");
    expect(r.basis).toBe("projected");
    expect(r.isProjected).toBe(true);
    expect(r.pace!.months).toBe(12);
    expect(r.pace!.perMonth).toBeCloseTo(1 / 12, 12);
    expect(r.value).toBe(Math.round((8 + monthsToTarget / 12) * 10) / 10);
    expect(r.low).toBe(r.value);
    expect(r.high).toBe(r.value);
    expect(r.year).toBe(2029);
    expect(r.assumption).toBe("At your logged pace (+0.08 a month since November 2025).");
  });

  it("prefers a year-ago rating (closest to 12) over a 6-month one", () => {
    const r = recruitingTimeUtr({
      ...base,
      history: [pt(2025, 10, 30, 6.5), pt(2025, 12, 1, 7), pt(2026, 5, 18, 7.9)],
    })!;
    expect(r.pace!.from.date).toEqual(day(2025, 12, 1)); // 11.5 months beats 12.6
  });

  it("uses the 6-month rating closest to 6 only when no year-ago rating exists", () => {
    const r = recruitingTimeUtr({ ...base, history: [pt(2026, 4, 1, 7.4), pt(2026, 5, 20, 7.7)] })!;
    expect(r.pace!.from.date).toEqual(day(2026, 5, 20));
    expect(r.assumption).toMatch(/since May 2026/);
  });

  it("window edges are local calendar days, inclusive: 13 months and 5 months count, a day beyond does not", () => {
    const pick = (h: UtrDataPoint[]) => loggedPaceFor({ currentUtr: 8, history: h, now: NOW })?.from.date ?? null;
    expect(pick([pt(2025, 10, 18, 7)])).toEqual(day(2025, 10, 18)); // exactly 13
    expect(pick([pt(2025, 10, 17, 7)])).toBeNull(); // 13 months + 1 day
    expect(pick([pt(2026, 6, 18, 7)])).toEqual(day(2026, 6, 18)); // exactly 5
    expect(pick([pt(2026, 6, 19, 7)])).toBeNull(); // 1 day under 5
    // The time of day on either side does not move an edge.
    expect(loggedPaceFor({ currentUtr: 8, history: [pt(2025, 10, 18, 7)], now: new Date(2026, 10, 18, 23, 59) })).not.toBeNull();
    expect(loggedPaceFor({ currentUtr: 8, history: [pt(2026, 6, 18, 7)], now: new Date(2026, 10, 18, 0, 1) })).not.toBeNull();
  });

  it("9 months is the year-ago side of the split; a day younger is the 6-month side", () => {
    // Exactly 9 months (year side) beats a 6-month rating; a day younger
    // (six side) loses to the one closer to 6.
    const h9 = [pt(2026, 2, 18, 7.1), pt(2026, 5, 18, 7.6)];
    expect(loggedPaceFor({ currentUtr: 8, history: h9, now: NOW })!.from.date).toEqual(day(2026, 2, 18));
    const h9less = [pt(2026, 2, 19, 7.1), pt(2026, 5, 18, 7.6)];
    expect(loggedPaceFor({ currentUtr: 8, history: h9less, now: NOW })!.from.date).toEqual(day(2026, 5, 18));
  });

  it("ties go to the more recent rating; two on one day to the later row", () => {
    // 11 and 13 months are equally close to 12.
    expect(
      loggedPaceFor({ currentUtr: 8, history: [pt(2025, 10, 18, 7), pt(2025, 12, 18, 7.2)], now: NOW })!.from.utr
    ).toBe(7.2);
    expect(
      loggedPaceFor({ currentUtr: 8, history: [pt(2025, 11, 18, 7), pt(2025, 11, 18, 7.3)], now: NOW })!.from.utr
    ).toBe(7.3);
  });

  it("a falling trend is held at today's rating — never projected lower", () => {
    const r = recruitingTimeUtr({ ...base, history: [pt(2025, 11, 18, 9.2)] })!;
    expect(r.source).toBe("logged-pace");
    expect(r.pace!.perMonth).toBeLessThan(0);
    expect(r.value).toBe(8);
    expect(r.low).toBe(8);
    expect(r.high).toBe(8);
    expect(r.assumption).toBe(
      "Your rating has gone down since November 2025 (−0.10 a month), so this stays at today's UTR."
    );
  });

  it("never rounds below today's rating", () => {
    // Flat at 8.24: the one-decimal rounding would give 8.2.
    const r = recruitingTimeUtr({ ...base, currentUtr: 8.24, history: [pt(2025, 11, 18, 8.24)] })!;
    expect(r.value).toBe(8.24);
  });

  it("growth is capped at the per-gender ceiling, and the sentence says so", () => {
    const r = recruitingTimeUtr({ ...base, gender: "female", currentUtr: 11, history: [pt(2025, 11, 18, 8)] })!;
    expect(r.value).toBe(REALISTIC_UTR_CEILING.female);
    expect(r.cappedByCeiling).toBe(true);
    expect(r.assumption).toBe(
      "At your logged pace (+0.25 a month since November 2025), capped near the top of college tennis."
    );
    // The ceiling caps growth; it never pulls a real rating above it down.
    const above = recruitingTimeUtr({ ...base, gender: "female", currentUtr: 13, history: [pt(2025, 11, 18, 12.6)] })!;
    expect(above.value).toBe(13);
  });

  it("ignores ratings Postgres would refuse", () => {
    const r = recruitingTimeUtr({ ...base, history: [pt(2025, 11, 18, 0), pt(2026, 5, 18, 17)] })!;
    expect(r.source).toBe("typical-growth");
  });
});

describe("rule 3: no qualifying logged rating → typical growth, exactly as before", () => {
  it("no history, only recent ratings, or only old ones", () => {
    const typical = projectUtrAtRecruiting({ ...base })!;
    for (const history of [undefined, [], [pt(2026, 11, 1, 7.9)], [pt(2024, 6, 1, 6)]]) {
      const r = recruitingTimeUtr({ ...base, history })!;
      expect(r.source).toBe("typical-growth");
      expect(r.value).toBe(typical.normal);
      expect(r.low).toBe(typical.slow);
      expect(r.high).toBe(typical.fast);
      expect(r.assumption).toBe(projectionAssumptionLabel("normal"));
    }
  });

  it("a synthetic line is never read as a logged pace (the homepage and the what-if)", () => {
    const realistic = realisticPaceProjectionFor({ currentUTR: 8, graduationYear: 2030, gender: "male", now: NOW });
    expect(realistic.utrHistory.every((p) => p.synthetic)).toBe(true);
    // One of its points sits 6 months back, inside the window: still ignored.
    expect(recruitingTimeUtr({ ...base, history: realistic.utrHistory })!.source).toBe("typical-growth");
    const homepage = buildFitReport({ ...base, schools: [], projectionInput: realistic })!;
    expect(homepage.utr.source).toBe("typical-growth");

    const real = { utrHistory: [pt(2025, 11, 18, 7)], graduationYear: 2030, gender: "male" as const, now: NOW };
    const whatIf = whatIfProjectionFor("plus1.5", real, { currentUTR: 8, hypotheticalUTR: 11 });
    expect(recruitingTimeUtr({ ...base, history: whatIf.utrHistory })!.source).toBe("typical-growth");
  });
});

describe("buildFitReport hands its logged history to the rule", () => {
  it("a signed-in player with a year-ago entry is judged at their pace, not typical growth", () => {
    const history = utrHistoryFromEntries([
      { utr: 7.5, recordedAt: "2025-11-18" },
      { utr: 8, recordedAt: "2026-11-18" },
    ]);
    const report = buildFitReport({
      ...base,
      schools: [],
      projectionInput: { utrHistory: history, graduationYear: 2030, gender: "male" },
    })!;
    expect(report.utr).toEqual(recruitingTimeUtr({ ...base, history }));
    expect(report.utr.source).toBe("logged-pace");
    // +0.5 in a year: half the typical 1.0/yr.
    expect(report.utr.value).toBe(9.3);
    expect(recruitingTimeUtr({ ...base })!.value).toBe(10.5); // typical growth
  });

  it("an explicit what-if choice is still used exactly as given", () => {
    const report = buildFitReport({
      ...base,
      schools: [],
      overrideUtr: 9.4,
      projectionInput: { utrHistory: [pt(2025, 11, 18, 7)], graduationYear: 2030, gender: "male" },
    })!;
    expect(report.utr.value).toBe(9.4);
    expect(report.utr.source).toBe("current");
  });
});

describe("the chart helpers follow the same rule", () => {
  const history = [pt(2025, 11, 18, 7)];
  const subject = { ...base, history };

  it("projectedUtrOn ends at recruitingTimeUtr's number and has no slow/fast spread", () => {
    const rtu = recruitingTimeUtr(subject)!;
    const end = projectedUtrOn(subject, projectionTargetDate(2030))!;
    expect(Math.round(end * 10) / 10).toBe(rtu.value);
    expect(projectedUtrOn(subject, projectionTargetDate(2030), "slow")).toBe(end);
    expect(projectedUtrOn(subject, projectionTargetDate(2030), "fast")).toBe(end);
    expect(projectedUtrOn(subject, NOW)).toBe(8);
  });

  it("a falling logged pace draws a flat line and never reaches a higher floor", () => {
    const falling = { ...base, history: [pt(2025, 11, 18, 9)] };
    expect(projectedUtrOn(falling, projectionTargetDate(2030))).toBe(8);
    expect(projectionReachDate(falling, 8.5)).toBeNull();
  });

  it("projectionReachDate uses the logged pace", () => {
    // +1/12 a month: 1.0 point takes 12 months → about Nov 2027.
    const at = projectionReachDate(subject, 9)!;
    expect(at.getFullYear()).toBe(2027);
    expect(at.getMonth()).toBe(10);
    expect(projectionReachDate(subject, 11)).toBeNull(); // 36 months: after June 2029
  });
});

describe("the wording helper", () => {
  const from = pt(2026, 5, 18, 7.5);

  it("rising, capped, falling, and someone else's", () => {
    expect(loggedPaceAssumption({ perMonth: 0.25, from })).toBe("At your logged pace (+0.25 a month since May 2026).");
    expect(loggedPaceAssumption({ perMonth: 0.4, from }, { capped: true })).toBe(
      "At your logged pace (+0.40 a month since May 2026), capped near the top of college tennis."
    );
    expect(loggedPaceAssumption({ perMonth: -0.1, from })).toBe(
      "Your rating has gone down since May 2026 (−0.10 a month), so this stays at today's UTR."
    );
    expect(loggedPaceAssumption({ perMonth: 0.25, from }, { whose: "Avery's" })).toBe(
      "At Avery's logged pace (+0.25 a month since May 2026)."
    );
    expect(loggedPaceAssumption({ perMonth: -0.1, from }, { whose: "Avery's" })).toMatch(/^Avery's rating has gone down/);
  });

  it("formats the pace signed, to two decimals, with no negative zero", () => {
    expect(formatPacePerMonth(0.0833)).toBe("+0.08");
    expect(formatPacePerMonth(0)).toBe("+0.00");
    expect(formatPacePerMonth(-0.001)).toBe("+0.00");
    expect(formatPacePerMonth(-0.126)).toBe("−0.13");
  });
});

describe("dates", () => {
  it("localMonthsBetween counts calendar months by local day", () => {
    expect(localMonthsBetween(day(2025, 11, 18), new Date(2026, 10, 18, 23, 30))).toBe(12);
    expect(localMonthsBetween(day(2026, 5, 18), NOW)).toBe(6);
    expect(localMonthsBetween(day(2026, 2, 28), day(2026, 8, 31))).toBeCloseTo(6 + 3 / 31, 12);
    expect(localMonthsBetween(NOW, day(2026, 5, 18))).toBe(-6);
  });

  it("utrHistoryFromEntries reads a date-only row as that LOCAL day", () => {
    const [p] = utrHistoryFromEntries([{ utr: 7, recordedAt: "2025-10-18" }]);
    expect([p.date.getFullYear(), p.date.getMonth(), p.date.getDate(), p.date.getHours()]).toEqual([2025, 9, 18, 0]);
  });
});

describe("staging personas (fake data on gnlcpnsweqbtwpaqhqqg), as of Nov 18 2026", () => {
  it("persona (a): 8.70, Class of 2031 — Feb 8 2026's 8.20 sets the pace: 11.0, not typical growth's 12.2", () => {
    const history = utrHistoryFromEntries([
      { utr: 7.6, recordedAt: "2025-06-01" },
      { utr: 7.9, recordedAt: "2025-10-05" },
      { utr: 8.2, recordedAt: "2026-02-08" },
      { utr: 8.5, recordedAt: "2026-06-14" },
      { utr: 8.7, recordedAt: "2026-11-08" },
    ]);
    const a = { currentUtr: 8.7, graduationYear: 2031, gender: "male" as const, now: NOW };
    expect(recruitingTimeUtr(a)!.value).toBe(12.2);
    const r = recruitingTimeUtr({ ...a, history })!;
    expect(r.pace!.from.date).toEqual(day(2026, 2, 8));
    expect(r.value).toBe(11);
  });

  it("fake-sweep-player: 5.95, Class of 2029 — the 13-month entry counts today, the 5-month one from tomorrow", () => {
    const history = utrHistoryFromEntries([
      { utr: 5.5, recordedAt: "2025-10-18" },
      { utr: 5.8, recordedAt: "2026-06-18" },
      { utr: 5.95, recordedAt: "2026-11-17" },
    ]);
    const s = { currentUtr: 5.95, graduationYear: 2029, gender: "male" as const, history };
    expect(recruitingTimeUtr({ ...s, history: undefined, now: NOW })!.value).toBe(7.5);
    const today = recruitingTimeUtr({ ...s, now: NOW })!;
    expect(today.pace!.from.date).toEqual(day(2025, 10, 18));
    expect(today.value).toBe(6.6);
    const tomorrow = recruitingTimeUtr({ ...s, now: new Date(2026, 10, 19, 12) })!;
    expect(tomorrow.pace!.from.date).toEqual(day(2026, 6, 18));
    expect(tomorrow.value).toBe(6.5);
  });
});
