import { describe, expect, it } from "vitest";
import { doneThisWeekLine, onTrackPill, outreachSummaryLine, recordTile } from "./empty-state-copy";

describe("onTrackPill", () => {
  it("is absent with no targets", () => {
    expect(onTrackPill(0, 0)).toBeNull();
  });
  it("never renders a green zero", () => {
    expect(onTrackPill(0, 3)).toEqual({ text: "None of your 3 targets on track yet", tone: "neutral" });
    expect(onTrackPill(0, 1)).toEqual({ text: "Your target isn't on track yet", tone: "neutral" });
  });
  it("is green with a real count", () => {
    expect(onTrackPill(2, 3)).toEqual({ text: "On track for 2 of 3 targets", tone: "good" });
    expect(onTrackPill(1, 1)).toEqual({ text: "On track for 1 of 1 target", tone: "good" });
  });
});

describe("doneThisWeekLine", () => {
  it("says what is missing instead of 'logged 0 matches'", () => {
    expect(doneThisWeekLine(0)).toBe("Done this week: no matches logged yet");
    expect(doneThisWeekLine(0)).not.toMatch(/\b0\b/);
  });
  it("counts real matches", () => {
    expect(doneThisWeekLine(1)).toBe("Done this week: logged 1 match");
    expect(doneThisWeekLine(3)).toBe("Done this week: logged 3 matches");
  });
});

describe("recordTile", () => {
  it("never prints 0–0", () => {
    expect(recordTile(null).value).toBe("Not tracked");
    expect(recordTile({ wins: 0, losses: 0 }).value).toBe("Not tracked");
  });
  it("prints a real record, including one-sided ones", () => {
    expect(recordTile({ wins: 1, losses: 0 })).toEqual({ value: "1–0", label: "logged record" });
    expect(recordTile({ wins: 0, losses: 2 }).value).toBe("0–2");
  });
});

describe("outreachSummaryLine", () => {
  it("says nothing has been sent instead of three zeros", () => {
    const s = outreachSummaryLine({ programs: 4, contacted: 0, emailed: 0, replied: 0, due: 0 });
    expect(s).toBe("4 programs · no emails marked sent yet");
    expect(s).not.toMatch(/0 emailed|0 replied|0 follow/);
  });
  it("keeps the counts once anything was sent, even if only an offer", () => {
    expect(outreachSummaryLine({ programs: 2, contacted: 1, emailed: 0, replied: 0, due: 0 })).toBe(
      "2 programs · 0 emailed · 0 replied · 0 follow-ups due this week"
    );
    expect(outreachSummaryLine({ programs: 1, contacted: 1, emailed: 1, replied: 0, due: 1 })).toBe(
      "1 program · 1 emailed · 0 replied · 1 follow-up due this week"
    );
  });
  it("handles no targets", () => {
    expect(outreachSummaryLine({ programs: 0, contacted: 0, emailed: 0, replied: 0, due: 0 })).toBe(
      "No target programs yet"
    );
  });
});
