import { describe, expect, it } from "vitest";
import {
  buildDefaultRecruitingChecklist,
  mergeRecruitingChecklist,
  type RecruitingChecklistContext,
} from "./recruiting-checklist";
import {
  getD1ContactOpenDate,
  getD1OffCampusContactDate,
  getD1WrittenOfferDate,
  getD3OffCampusContactDate,
  getD3OfficialVisitDate,
  localDateKey,
} from "./time";

function context(overrides: Partial<RecruitingChecklistContext> = {}): RecruitingChecklistContext {
  return {
    graduationYear: 2029,
    targetSchoolCount: 0,
    utrProfileLink: null,
    contactedOrRepliedCount: 0,
    ...overrides,
  };
}

describe("buildDefaultRecruitingChecklist — real D1/D3 date computation", () => {
  it("computes every date-gated milestone from the real graduation year, matching lib/time.ts directly", () => {
    const items = buildDefaultRecruitingChecklist(context({ graduationYear: 2029 }));
    const byId = new Map(items.map((i) => [i.id, i]));

    expect(byId.get("d1-contact-open")!.dueDate).toBe(localDateKey(getD1ContactOpenDate(2029)));
    expect(byId.get("d1-offcampus-contact")!.dueDate).toBe(localDateKey(getD1OffCampusContactDate(2029)));
    expect(byId.get("d1-written-offer")!.dueDate).toBe(localDateKey(getD1WrittenOfferDate(2029)));
    expect(byId.get("d3-offcampus-contact")!.dueDate).toBe(localDateKey(getD3OffCampusContactDate(2029)));
    expect(byId.get("d3-official-visit")!.dueDate).toBe(localDateKey(getD3OfficialVisitDate(2029)));
  });

  it("recomputes to a different real year for a different grad year — never hardcoded to one class", () => {
    const items2029 = buildDefaultRecruitingChecklist(context({ graduationYear: 2029 }));
    const items2031 = buildDefaultRecruitingChecklist(context({ graduationYear: 2031 }));
    const d1open2029 = items2029.find((i) => i.id === "d1-contact-open")!.dueDate;
    const d1open2031 = items2031.find((i) => i.id === "d1-contact-open")!.dueDate;
    expect(d1open2029).not.toBe(d1open2031);
    expect(d1open2029).toBe("2027-06-15");
    expect(d1open2031).toBe("2029-06-15");
  });

  it("leaves evergreen tasks (NCAA Eligibility Center, highlight video, camps, D3 unofficial visits) with no due date", () => {
    const items = buildDefaultRecruitingChecklist(context());
    for (const id of ["ncaa-eligibility", "highlight-video", "camps-showcases", "d3-unofficial-visit"]) {
      expect(items.find((i) => i.id === id)!.dueDate).toBeNull();
    }
  });

  it("marks the target-list item real-done only once a school is actually starred", () => {
    expect(buildDefaultRecruitingChecklist(context({ targetSchoolCount: 0 })).find((i) => i.id === "target-list")!.autoDone).toBe(false);
    expect(buildDefaultRecruitingChecklist(context({ targetSchoolCount: 3 })).find((i) => i.id === "target-list")!.autoDone).toBe(true);
  });

  it("marks the UTR-profile-link item real-done only once a real link is saved", () => {
    expect(buildDefaultRecruitingChecklist(context({ utrProfileLink: null })).find((i) => i.id === "utr-profile-link")!.autoDone).toBe(false);
    expect(
      buildDefaultRecruitingChecklist(context({ utrProfileLink: "https://app.universaltennis.com/profiles/123" })).find(
        (i) => i.id === "utr-profile-link"
      )!.autoDone
    ).toBe(true);
  });

  it("marks the coach-emails item real-done only once at least one target has been contacted", () => {
    expect(buildDefaultRecruitingChecklist(context({ contactedOrRepliedCount: 0 })).find((i) => i.id === "coach-emails")!.autoDone).toBe(
      false
    );
    expect(buildDefaultRecruitingChecklist(context({ contactedOrRepliedCount: 2 })).find((i) => i.id === "coach-emails")!.autoDone).toBe(
      true
    );
  });

  it("every item with no real autoDone signal (manual tasks) reports null, never a fabricated boolean", () => {
    const manualIds = [
      "ncaa-eligibility",
      "highlight-video",
      "camps-showcases",
      "d1-contact-open",
      "d1-offcampus-contact",
      "d1-written-offer",
      "d3-offcampus-contact",
      "d3-official-visit",
      "d3-unofficial-visit",
    ];
    const items = buildDefaultRecruitingChecklist(context());
    for (const id of manualIds) {
      expect(items.find((i) => i.id === id)!.autoDone).toBeNull();
    }
  });
});

describe("mergeRecruitingChecklist", () => {
  it("reflects autoDone as completed regardless of persisted state, and marks it non-editable", () => {
    const merged = mergeRecruitingChecklist(context({ targetSchoolCount: 2 }), {
      completedIds: [],
      hiddenIds: [],
      customItems: [],
    });
    const targetList = merged.find((i) => i.id === "target-list")!;
    expect(targetList.completed).toBe(true);
    expect(targetList.editable).toBe(false);
  });

  it("respects a persisted completed toggle for a genuinely manual item", () => {
    const merged = mergeRecruitingChecklist(context(), {
      completedIds: ["ncaa-eligibility"],
      hiddenIds: [],
      customItems: [],
    });
    const eligibility = merged.find((i) => i.id === "ncaa-eligibility")!;
    expect(eligibility.completed).toBe(true);
    expect(eligibility.editable).toBe(true);
  });

  it("respects a persisted hidden flag independent of completed state", () => {
    const merged = mergeRecruitingChecklist(context(), {
      completedIds: [],
      hiddenIds: ["camps-showcases"],
      customItems: [],
    });
    expect(merged.find((i) => i.id === "camps-showcases")!.hidden).toBe(true);
  });

  it("appends real custom items with their own completed/hidden state and no due date", () => {
    const merged = mergeRecruitingChecklist(context(), {
      completedIds: ["custom-1"],
      hiddenIds: [],
      customItems: [{ id: "custom-1", label: "Call club coach" }],
    });
    const custom = merged.find((i) => i.id === "custom-1")!;
    expect(custom.label).toBe("Call club coach");
    expect(custom.isCustom).toBe(true);
    expect(custom.completed).toBe(true);
    expect(custom.editable).toBe(true);
    expect(custom.dueDate).toBeNull();
  });
});
