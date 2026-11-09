// A real, derived categorization over the School catalog's actual `state`
// field — the same category of thing as `combinedScore()` (a formula over
// real fields), not fabricated per-school data. There is no stored `region`
// field on School; this groups the 50 states + DC into the standard US
// Census-style regions the Schools.dc.html mockup's filter implies
// ("Mid-Atlantic, Northeast" etc.).
export type SchoolRegion =
  | "Northeast"
  | "Mid-Atlantic"
  | "Southeast"
  | "Midwest"
  | "South"
  | "West";

const STATE_REGION: Record<string, SchoolRegion> = {
  CT: "Northeast", ME: "Northeast", MA: "Northeast", NH: "Northeast",
  RI: "Northeast", VT: "Northeast",
  NJ: "Mid-Atlantic", NY: "Mid-Atlantic", PA: "Mid-Atlantic",
  DE: "Mid-Atlantic", MD: "Mid-Atlantic", DC: "Mid-Atlantic", VA: "Mid-Atlantic",
  WV: "Mid-Atlantic",
  NC: "Southeast", SC: "Southeast", GA: "Southeast", FL: "Southeast",
  AL: "Southeast", MS: "Southeast", TN: "Southeast", KY: "Southeast",
  IL: "Midwest", IN: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest",
  IA: "Midwest", KS: "Midwest", MN: "Midwest", MO: "Midwest", NE: "Midwest",
  ND: "Midwest", SD: "Midwest",
  AR: "South", LA: "South", OK: "South", TX: "South",
  AZ: "West", CO: "West", ID: "West", MT: "West", NV: "West", NM: "West",
  UT: "West", WY: "West", AK: "West", CA: "West", HI: "West", OR: "West",
  WA: "West",
};

export function regionForState(state: string): SchoolRegion | null {
  return STATE_REGION[state.toUpperCase()] ?? null;
}

export const ALL_REGIONS: SchoolRegion[] = [
  "Northeast",
  "Mid-Atlantic",
  "Southeast",
  "Midwest",
  "South",
  "West",
];
