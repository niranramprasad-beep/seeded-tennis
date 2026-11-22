import { afterEach, describe, expect, it, vi } from "vitest";
import { csvEscape, buildAccountDataCsv, downloadTextFile, DOWNLOAD_URL_REVOKE_DELAY_MS } from "./export-csv";
import { emptyPlayer } from "./user";

describe("csvEscape", () => {
  it("leaves plain values bare", () => {
    expect(csvEscape("Duke")).toBe("Duke");
    expect(csvEscape(9.5)).toBe("9.5");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes and escapes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("Smith, Jane")).toBe('"Smith, Jane"');
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildAccountDataCsv", () => {
  const player = { ...emptyPlayer, name: "Maya Chen" };

  it("includes all 4 section headers even with no data", () => {
    const csv = buildAccountDataCsv({
      player,
      targetSchools: [],
      matches: [],
      utrEntries: [],
      outreach: {},
    });
    expect(csv).toContain("Schools");
    expect(csv).toContain("Results");
    expect(csv).toContain("UTR history");
    expect(csv).toContain("Outreach");
    expect(csv).toContain("Maya Chen");
  });

  it("renders a school row", () => {
    const csv = buildAccountDataCsv({
      player,
      targetSchools: [
        {
          id: "1",
          slug: "duke-w",
          name: "Duke",
          shortName: "Duke",
          city: "Durham",
          state: "NC",
          conference: "ACC",
          division: "D1",
          gender: "women",
          primaryColor: "#000",
          secondaryColor: "#fff",
          textColor: "#fff",
          avgRosterUTR: 12,
          minCompetitiveUTR: 10,
          usNewsRanking: 10,
        },
      ],
      matches: [],
      utrEntries: [],
      outreach: {},
    });
    expect(csv).toContain("Duke,duke-w,ACC,NC,D1");
  });
});

describe("downloadTextFile", () => {
  // The DOM is stubbed: vitest runs in node. What matters is the ORDER —
  // the blob: URL must still be alive after click(), because WebKit
  // (Safari, every iOS browser) starts the download asynchronously and an
  // immediate revoke fails it.
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubDom() {
    const calls: string[] = [];
    const link = {
      href: "",
      download: "",
      rel: "",
      click: () => calls.push("click"),
    };
    vi.stubGlobal("document", {
      createElement: () => link,
      body: {
        appendChild: () => calls.push("append"),
        removeChild: () => calls.push("remove"),
      },
    });
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return "blob:test";
      },
      revokeObjectURL: (u: string) => calls.push(`revoke ${u}`),
    });
    return { calls, link, blobs };
  }

  it("clicks first and revokes the blob URL only after a delay", () => {
    vi.useFakeTimers();
    const { calls, link } = stubDom();
    downloadTextFile("seeded.ics", "BEGIN:VCALENDAR\r\n", "text/calendar");
    expect(link.download).toBe("seeded.ics");
    expect(calls).toEqual(["append", "click", "remove"]);
    vi.advanceTimersByTime(DOWNLOAD_URL_REVOKE_DELAY_MS - 1);
    expect(calls).not.toContain("revoke blob:test");
    vi.advanceTimersByTime(1);
    expect(calls).toContain("revoke blob:test");
  });

  it("labels the blob with a well-formed UTF-8 media type", () => {
    vi.useFakeTimers();
    const { blobs } = stubDom();
    downloadTextFile("seeded.ics", "x", "text/calendar");
    expect(blobs[0].type).toBe("text/calendar;charset=utf-8");
  });
});
