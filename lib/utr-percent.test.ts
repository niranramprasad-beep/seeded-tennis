import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { formatPercentChange, formatSignedAmount, formatUtrPercentChange, utrChange } from "./utr-percent";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("formatPercentChange (the generic helper)", () => {
  it("one decimal, explicit sign, U+2212 for a fall", () => {
    expect(formatPercentChange(100, 110)).toBe("+10.0%");
    expect(formatPercentChange(9.9, 10.75)).toBe("+8.6%");
    expect(formatPercentChange(10, 9.79)).toBe("−2.1%");
    expect(formatPercentChange(1840, 920)).toBe("−50.0%");
  });

  it("a gain and a loss of the same size print the same digits", () => {
    // ±0.07 on 1.12 is exactly ±6.25%.
    expect(formatPercentChange(1.12, 1.19)).toBe("+6.3%");
    expect(formatPercentChange(1.12, 1.05)).toBe("−6.3%");
  });

  it("divide by zero is no percent, never Infinity%", () => {
    expect(formatPercentChange(0, 5)).toBeNull();
    expect(formatPercentChange(0, 0)).toBeNull();
    expect(formatPercentChange(-0, 5)).toBeNull();
  });

  it("a negative base is no percent (a % of a debt reads backwards)", () => {
    expect(formatPercentChange(-10, 5)).toBeNull();
  });

  it.each([null, undefined, NaN, Infinity, -Infinity])("missing / non-finite %s in either position is no percent", (v) => {
    expect(formatPercentChange(v as number, 10)).toBeNull();
    expect(formatPercentChange(10, v as number)).toBeNull();
  });

  it("a change that rounds to 0.0% is no percent", () => {
    expect(formatPercentChange(10, 10)).toBeNull();
    expect(formatPercentChange(10, 10.004)).toBeNull();
    expect(formatPercentChange(10, 9.996)).toBeNull();
  });

  it("a fall to zero is −100.0%", () => {
    expect(formatPercentChange(50, 0)).toBe("−100.0%");
  });

  it("never prints NaN or Infinity for any input", () => {
    const values = [0, -1, 1, 0.5, 7, 16.5, NaN, Infinity, -Infinity, 1e-12, 1e12];
    for (const a of values) for (const b of values) {
      const r = formatPercentChange(a, b);
      if (r !== null) expect(r).toMatch(/^[+−]\d+\.\d%$/);
    }
  });
});

describe("formatUtrPercentChange (ratings only)", () => {
  it("formats two real ratings", () => {
    expect(formatUtrPercentChange(9.3, 9.42)).toBe("+1.3%");
    expect(formatUtrPercentChange(7, 7.5)).toBe("+7.1%");
  });

  it.each([0, -1, null, undefined, NaN])("the 0 sentinel / missing %s in either position shows no percent", (value) => {
    expect(formatUtrPercentChange(value, 10)).toBeNull();
    expect(formatUtrPercentChange(10, value)).toBeNull();
  });

  it("an unchanged rating, or a change too small to round, shows none", () => {
    expect(formatUtrPercentChange(10, 10)).toBeNull();
    expect(formatUtrPercentChange(10, 10.001)).toBeNull();
    expect(formatUtrPercentChange(10, 9.999)).toBeNull();
  });
});

describe("formatSignedAmount (the raw change, always kept)", () => {
  it("explicit sign both ways, two decimals by default", () => {
    expect(formatSignedAmount(0.12)).toBe("+0.12");
    expect(formatSignedAmount(-0.2)).toBe("−0.20");
    expect(formatSignedAmount(0.5, 1)).toBe("+0.5");
  });
  it("rounds half up by magnitude, so ± agree", () => {
    expect(formatSignedAmount(0.125)).toBe("+0.13");
    expect(formatSignedAmount(-0.125)).toBe("−0.13");
    // 9.42 − 9.30 in floating point is 0.11999…
    expect(formatSignedAmount(9.42 - 9.3)).toBe("+0.12");
  });
  it("nothing is unsigned zero, not +0.00 or −0.00", () => {
    expect(formatSignedAmount(0)).toBe("0.00");
    expect(formatSignedAmount(-0.001)).toBe("0.00");
  });
});

describe("utrChange (both halves for ChangeFigure)", () => {
  it("up, down and flat", () => {
    expect(utrChange(9.3, 9.42)).toEqual({ amount: "+0.12", percent: "+1.3%", direction: "up" });
    expect(utrChange(8.1, 7.9)).toEqual({ amount: "−0.20", percent: "−2.5%", direction: "down" });
    expect(utrChange(8, 8)).toEqual({ amount: "0.00", percent: null, direction: "flat" });
  });
  it("a change too small for the raw number has no percent either", () => {
    expect(utrChange(1, 1.004)).toEqual({ amount: "0.00", percent: null, direction: "flat" });
  });
  it("no comparison without two real ratings", () => {
    expect(utrChange(0, 9)).toBeNull();
    expect(utrChange(9, null)).toBeNull();
    expect(utrChange(undefined, 9)).toBeNull();
  });
});

describe("where changes are shown", () => {
  it("every delta surface draws through ChangeFigure (percent leads, raw beside it)", () => {
    for (const f of [
      "components/seeded/family/dashboard/dashboard-body.tsx",
      "components/seeded/family/seeded-weekly-report-view.tsx",
      "components/seeded/sample-report/sample-report-view.tsx",
      "components/seeded/home/seeded-home-view.tsx",
    ]) {
      expect(read(f), f).toMatch(/<ChangeFigure\b/);
    }
  });

  it("ChangeFigure renders the percent first and never drops the raw amount", () => {
    const src = read("components/seeded/ui/change-figure.tsx");
    const body = src.slice(src.indexOf("return ("));
    expect(body.indexOf("{percent}")).toBeGreaterThan(-1);
    expect(body.indexOf("{percent}")).toBeLessThan(body.indexOf("{amount}"));
    // The no-percent branch still shows the amount.
    expect(src).toMatch(/if \(!percent\) \{\s*return <span[^>]*>\{amount\}<\/span>/);
  });

  it("the weekly report no longer hand-formats its own signed delta", () => {
    const src = read("components/seeded/family/seeded-weekly-report-view.tsx");
    expect(src).not.toMatch(/delta\.toFixed\(2\)/);
  });

  it("fit bands are never a percent: no fit code imports the percent helper", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n) && !n.includes(".test.")) files.push(p);
      }
    };
    walk(join(ROOT, "lib/fit"));
    files.push(join(ROOT, "lib/fit.ts"), join(ROOT, "lib/school-fit.ts"), join(ROOT, "lib/fit-copy.ts"));
    for (const f of files) {
      expect(readFileSync(f, "utf8"), relative(ROOT, f)).not.toMatch(/utr-percent|change-figure/);
    }
  });
});

describe("formatPercentChange: absurd bases", () => {
  it("a near-zero base gives no percent rather than an exponent", () => {
    expect(formatPercentChange(1e-12, 1e12)).toBeNull();
    expect(formatPercentChange(0.0001, 1000)).toBeNull();
  });
});
