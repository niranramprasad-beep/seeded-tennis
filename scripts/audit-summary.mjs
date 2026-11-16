// Summarise a site-audit pass: node scripts/audit-summary.mjs tier1 [persona]
import { readFileSync } from "node:fs";
import { join } from "node:path";
const pass = process.argv[2] ?? "tier1";
const only = process.argv[3];
const rows = readFileSync(join(process.env.HOME, "seeded-evidence/overnight/audit", pass, "results.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !only || r.persona === only);
const issues = {};
const add = (k, r, detail) => ((issues[k] ??= []).push(`${r.browser}/${r.persona}/${r.theme}/${r.width} ${r.route}${r.finalPath && r.finalPath !== r.route ? ` -> ${r.finalPath}` : ""}  ${detail ?? ""}`));
for (const r of rows) {
  if (r.signInError) { add("sign-in failed", r, r.signInError); continue; }
  if (r.error) add("load error", r, r.error);
  if (r.status >= 500) add("HTTP 5xx", r, r.status);
  for (const e of r.consoleErrors ?? []) {
    // a deliberate 404 page logs its own document 404
    if (r.status === 404 && /status of 404/.test(e)) continue;
    add("console error", r, e);
  }
  for (const e of r.failedRequests ?? []) add("failed request", r, e);
  for (const v of r.axe ?? []) add(`axe ${v.id}`, r, `${v.impact} x${v.nodes} ${v.sample}`);
  if (r.hScroll) add("horizontal scroll", r, r.hScroll);
  for (const j of r.junk ?? []) add("rendered junk", r, j);
  if (r.smallTargetCount) add("target < 24px", r, `${r.smallTargetCount}: ${r.smallTargets.slice(0, 3).join(" | ")}`);
  if (r.smallTextCount) add("actionable text < 14px", r, `${r.smallTextCount}: ${r.smallText.slice(0, 3).join(" | ")}`);
  for (const l of r.badLinks ?? []) add("bad link", r, JSON.stringify(l));
  if (r.imgsNoAlt?.length) add("img without alt", r, r.imgsNoAlt.join(","));
  if (r.h1 !== undefined && r.h1 !== 1 && !/\.(txt|xml)$/.test(r.route)) add(`h1 count ${r.h1}`, r, r.h1Text ?? "");
  if (r.cls > 0.05) add("CLS > 0.05", r, r.cls);
  const wantMode = r.theme === "dark" || r.theme === "system-dark" ? "dark" : r.theme === "legacy" ? null : "light";
  if (wantMode && r.renderedMode && r.renderedMode !== wantMode && r.renderedDesign !== "legacy") add("theme not applied", r, `${r.renderedMode}`);
  if (r.spinnerOnly) add("blank / spinner only", r, `${r.textLength} chars`);
}
console.log(`${rows.length} records`);
for (const [k, v] of Object.entries(issues).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${k} — ${v.length}`);
  for (const line of [...new Set(v)].slice(0, Number(process.env.N ?? 6))) console.log("   " + line);
}
