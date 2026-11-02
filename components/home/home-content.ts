import { BarChart3, Compass, Mail, Route, School } from "lucide-react";

// Shared copy/content for both Legacy's and Seeded's home page compositions
// (components/home/legacy-home-view.tsx, components/seeded/home/*) — kept
// in one place so the two layouts can't drift on what they actually say.

export const CAPABILITIES = [
  {
    icon: School,
    title: "School matching",
    body: "Compare programs by roster UTR, academics, and division.",
  },
  {
    icon: Route,
    title: "Year-by-year roadmap",
    body: "Honest UTR targets for each grade, not aspirational ones.",
  },
  {
    icon: Compass,
    title: "Tournament fit finder",
    body: "Know if an event is worth entering before you pay.",
  },
  {
    icon: Mail,
    title: "Coach outreach",
    body: "Specific, credible emails tracked by conversation.",
  },
];

export const METHODOLOGY: [string, string][] = [
  ["Roster reality", "Average and minimum competitive UTR by division, men's and women's."],
  ["Academic context", "GPA, grad year, and US News standing at a glance."],
  ["Timeline pressure", "Summer-before-grade checkpoints, shown as bands — never guarantees."],
];

export const LOOP: [string, string][] = [
  ["Assess", "UTR, grade, grad year, and target division."],
  ["Match", "Rank programs by tennis and academic fit."],
  ["Train", "Build the week around the actual gap."],
  ["Track", "Log check-ins, matches, and coach replies."],
];

export { BarChart3 };
