import { describe, expect, it } from "vitest";
import {
  buildIcsCalendar,
  escapeIcsText,
  foldIcsLine,
  icsFilename,
  icsUid,
  icsUtcDateTime,
  ICS_PRODID,
  type IcsEvent,
} from "./ics";

// RFC 5545, checked on the bytes: what Google Calendar and Apple Calendar
// actually parse. Each `it` pins one guarantee in lib/ics.ts's header.

const NOW = new Date(Date.UTC(2026, 10, 22, 9, 30, 5));

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** Physical lines of a file (split on CRLF, the trailing empty one dropped). */
const physicalLines = (ics: string) => ics.split("\r\n").slice(0, -1);

/** Content lines after unfolding (RFC 5545 §3.1). */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);

const timed: IcsEvent = {
  kind: "timed",
  id: "session-1",
  summary: "Tennis",
  start: new Date(Date.UTC(2026, 10, 24, 21, 0)),
  end: new Date(Date.UTC(2026, 10, 24, 22, 30)),
};

const allDay: IcsEvent = { kind: "all-day", id: "tournament-1", summary: "Fall Open", date: "2026-11-28" };

describe("calendar envelope", () => {
  it("has PRODID, VERSION:2.0, CALSCALE:GREGORIAN and METHOD:PUBLISH inside one VCALENDAR", () => {
    const lines = unfold(buildIcsCalendar([timed], { now: NOW }));
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain(`PRODID:${ICS_PRODID}`);
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines.filter((l) => l === "BEGIN:VCALENDAR")).toHaveLength(1);
  });

  it("uses CRLF for every line break, including after the last line, and never a bare LF or CR", () => {
    const ics = buildIcsCalendar([timed, allDay], { now: NOW });
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("adds no alarm — Seeded sends no reminders and does not ask a calendar to", () => {
    expect(buildIcsCalendar([timed, allDay], { now: NOW })).not.toContain("VALARM");
  });

  it("builds an empty but valid calendar for no events", () => {
    const lines = unfold(buildIcsCalendar([], { now: NOW }));
    expect(lines).not.toContain("BEGIN:VEVENT");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
  });
});

describe("escaping (TEXT values)", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    expect(escapeIcsText("one\r\ntwo\rthree")).toBe("one\\ntwo\\nthree");
  });

  it("escapes the backslash first, so an escape is never double-escaped", () => {
    expect(escapeIcsText("\\;")).toBe("\\\\\\;");
  });

  it("drops control characters other than tab", () => {
    expect(escapeIcsText("a\u0000b\u0007c\td\u007F")).toBe("abc\td");
  });

  it("escapes SUMMARY, DESCRIPTION and LOCATION in the file", () => {
    const ics = buildIcsCalendar(
      [{ ...allDay, summary: "Open; U18, boys", description: "Bring 2 rackets\nand water", location: "Austin, TX" }],
      { now: NOW }
    );
    const lines = unfold(ics);
    expect(lines).toContain("SUMMARY:Open\\; U18\\, boys");
    expect(lines).toContain("DESCRIPTION:Bring 2 rackets\\nand water");
    expect(lines).toContain("LOCATION:Austin\\, TX");
  });

  it("leaves out DESCRIPTION and LOCATION when they are empty — nothing is invented to fill them", () => {
    const lines = unfold(buildIcsCalendar([{ ...allDay, description: "  ", location: null }], { now: NOW }));
    expect(lines.some((l) => l.startsWith("DESCRIPTION"))).toBe(false);
    expect(lines.some((l) => l.startsWith("LOCATION"))).toBe(false);
  });

  it("writes URL as a URI (not TEXT-escaped) and only for http(s)", () => {
    const ok = unfold(buildIcsCalendar([{ ...allDay, url: "https://seededtennis.com/events?a=1,2" }], { now: NOW }));
    expect(ok).toContain("URL:https://seededtennis.com/events?a=1,2");
    const bad = unfold(buildIcsCalendar([{ ...allDay, url: "javascript:alert(1)" }], { now: NOW }));
    expect(bad.some((l) => l.startsWith("URL"))).toBe(false);
  });
});

describe("folding at 75 octets", () => {
  it("leaves a line of exactly 75 octets alone", () => {
    const line = "X".repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds a long ASCII line: 75 octets, then a space + 74", () => {
    const line = "SUMMARY:" + "a".repeat(200);
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(utf8Length(parts[0])).toBe(75);
    for (const p of parts.slice(1)) {
      expect(p.startsWith(" ")).toBe(true);
      expect(utf8Length(p)).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("counts UTF-8 bytes, not characters, and never splits a multi-byte character", () => {
    // é is 2 octets, 🎾 is 4 (a surrogate pair in JS).
    const line = "SUMMARY:" + "é".repeat(50) + "🎾".repeat(20);
    const folded = foldIcsLine(line);
    for (const p of folded.split("\r\n")) {
      expect(utf8Length(p)).toBeLessThanOrEqual(75);
      // A split surrogate pair would show as a lone surrogate.
      expect(p).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("keeps every physical line of a whole file within 75 octets", () => {
    const ics = buildIcsCalendar(
      [{ ...timed, description: "Long note, with commas; and ünïcödé — ".repeat(20), location: "Ä".repeat(90) }],
      { now: NOW }
    );
    for (const line of physicalLines(ics)) expect(utf8Length(line)).toBeLessThanOrEqual(75);
    const description = unfold(ics).find((l) => l.startsWith("DESCRIPTION:"));
    expect(description).toBe(`DESCRIPTION:${escapeIcsText("Long note, with commas; and ünïcödé — ".repeat(20).trim())}`);
  });
});

describe("all-day events", () => {
  it("are DTSTART;VALUE=DATE with an exclusive DTEND the next day", () => {
    const lines = unfold(buildIcsCalendar([allDay], { now: NOW }));
    expect(lines).toContain("DTSTART;VALUE=DATE:20261128");
    expect(lines).toContain("DTEND;VALUE=DATE:20261129");
  });

  it("roll over month and year ends, and leap days", () => {
    const at = (date: string) => unfold(buildIcsCalendar([{ ...allDay, date }], { now: NOW }));
    expect(at("2026-12-31")).toContain("DTEND;VALUE=DATE:20270101");
    expect(at("2028-02-28")).toContain("DTEND;VALUE=DATE:20280229");
    expect(at("2028-02-29")).toContain("DTEND;VALUE=DATE:20280301");
    expect(at("2026-11-30")).toContain("DTEND;VALUE=DATE:20261201");
  });

  it("span several days with lastDate inclusive (DTEND the day after it)", () => {
    const lines = unfold(buildIcsCalendar([{ ...allDay, date: "2026-11-27", lastDate: "2026-11-29" }], { now: NOW }));
    expect(lines).toContain("DTSTART;VALUE=DATE:20261127");
    expect(lines).toContain("DTEND;VALUE=DATE:20261130");
  });

  it("do not depend on the device's time zone", () => {
    // Pure calendar arithmetic; `npm run test:tz` runs this in New York and
    // Auckland too.
    const lines = unfold(buildIcsCalendar([{ ...allDay, date: "2026-03-08" }], { now: NOW }));
    expect(lines).toContain("DTSTART;VALUE=DATE:20260308");
    expect(lines).toContain("DTEND;VALUE=DATE:20260309");
  });

  it("reject a date that is not a real calendar day, or an end before the start", () => {
    expect(() => buildIcsCalendar([{ ...allDay, date: "2026-02-30" }], { now: NOW })).toThrow();
    expect(() => buildIcsCalendar([{ ...allDay, date: "11/28/2026" }], { now: NOW })).toThrow();
    expect(() => buildIcsCalendar([{ ...allDay, lastDate: "2026-11-27" }], { now: NOW })).toThrow();
  });
});

describe("timed events", () => {
  it("are written in UTC with a Z and no TZID (so no VTIMEZONE is needed)", () => {
    const ics = buildIcsCalendar([timed], { now: NOW });
    const lines = unfold(ics);
    expect(lines).toContain("DTSTART:20261124T210000Z");
    expect(lines).toContain("DTEND:20261124T223000Z");
    expect(ics).not.toContain("TZID");
    expect(ics).not.toContain("VTIMEZONE");
  });

  it("reject an end that is not after the start", () => {
    expect(() => buildIcsCalendar([{ ...timed, end: timed.start }], { now: NOW })).toThrow();
  });

  it("formats a UTC date-time with zero padding", () => {
    expect(icsUtcDateTime(new Date(Date.UTC(2027, 0, 2, 3, 4, 5)))).toBe("20270102T030405Z");
  });
});

describe("DTSTAMP and UID", () => {
  it("stamps every event with the same UTC DTSTAMP", () => {
    const lines = unfold(buildIcsCalendar([timed, allDay], { now: NOW }));
    expect(lines.filter((l) => l === "DTSTAMP:20261122T093005Z")).toHaveLength(2);
  });

  it("gives each event its id + @seededtennis.com", () => {
    const lines = unfold(buildIcsCalendar([timed, allDay], { now: NOW }));
    expect(lines).toContain("UID:session-1@seededtennis.com");
    expect(lines).toContain("UID:tournament-1@seededtennis.com");
    expect(icsUid("abc")).toBe("abc@seededtennis.com");
    expect(() => icsUid("  ")).toThrow();
  });

  it("is stable: the same item exported twice, at different times and with edits, keeps its UID", () => {
    const uid = (ics: string) => unfold(ics).filter((l) => l.startsWith("UID:"));
    const first = buildIcsCalendar([timed], { now: NOW });
    const later = buildIcsCalendar([{ ...timed, summary: "Match play" }], { now: new Date(Date.UTC(2027, 5, 1)) });
    expect(uid(first)).toEqual(uid(later));
  });

  it("is otherwise deterministic for a fixed `now`", () => {
    expect(buildIcsCalendar([timed, allDay], { now: NOW })).toBe(buildIcsCalendar([timed, allDay], { now: NOW }));
  });
});

describe("several events in one file", () => {
  it("writes one VEVENT per event, in the order given, each closed before the next opens", () => {
    const events: IcsEvent[] = [timed, allDay, { ...timed, id: "session-2" }];
    const lines = unfold(buildIcsCalendar(events, { now: NOW }));
    const begins = lines.flatMap((l, i) => (l === "BEGIN:VEVENT" ? [i] : []));
    const ends = lines.flatMap((l, i) => (l === "END:VEVENT" ? [i] : []));
    expect(begins).toHaveLength(3);
    expect(ends).toHaveLength(3);
    begins.forEach((b, i) => {
      expect(b).toBeLessThan(ends[i]);
      if (i > 0) expect(b).toBeGreaterThan(ends[i - 1]);
    });
    expect(lines.filter((l) => l.startsWith("UID:"))).toEqual([
      "UID:session-1@seededtennis.com",
      "UID:tournament-1@seededtennis.com",
      "UID:session-2@seededtennis.com",
    ]);
  });
});

describe("icsFilename", () => {
  it("keeps only lowercase letters, digits and single hyphens, and ends .ics", () => {
    expect(icsFilename("seeded-Fall Open: U18/Boys-2026-11-28")).toBe("seeded-fall-open-u18-boys-2026-11-28.ics");
    expect(icsFilename("../../etc/passwd")).toBe("etc-passwd.ics");
    expect(icsFilename("Café Ünïon")).toBe("cafe-union.ics");
    expect(icsFilename("plan.ics")).toBe("plan.ics");
  });

  it("falls back to a default name and caps the length", () => {
    expect(icsFilename("")).toBe("seeded-calendar.ics");
    expect(icsFilename("🎾🎾")).toBe("seeded-calendar.ics");
    const long = icsFilename("a".repeat(30) + " " + "b".repeat(80));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*\.ics$/);
  });
});
