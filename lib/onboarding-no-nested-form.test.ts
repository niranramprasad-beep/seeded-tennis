import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { codeOnly } from "./testing/source-text";

// Final-check PR C (2026-11-21), found on the onboarding walk: the
// diagnostic's question card was a <form>, and its save step rendered
// DiagnosticSaveForm — another <form> — inside it. React does not prevent a
// submit from a form nested in a form, so "Create free account" (player) and
// "Create parent account" did a native GET of /onboarding: the page
// reloaded, every answer was lost and no account was created. Reproduced on
// a local build of main d3bc348 (= production) and of this branch before
// the fix; the independent verifier confirmed it on production.
//
// Fails the build if a sign-up form can be nested in a form again — in ANY
// file: every place that renders <DiagnosticSaveForm or <SignupFlow is
// checked, and so is every place that renders the component containing
// that place, up the tree (review item: the first version read only
// diagnostic-flow.tsx, so wrapping the fit report's save host in a <form>
// passed).

const ROOT = join(__dirname, "..");
const SIGNUP_FORMS = ["DiagnosticSaveForm", "SignupFlow"];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(p));
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))].map((f) => ({
  file: relative(ROOT, f),
  src: codeOnly(f),
}));

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/** Components whose own markup contains a <form> (so rendering one around a
 * sign-up form nests forms). QuestionShell is the one deliberate exception:
 * it is a <div> on the save step, pinned separately below. */
const FORM_COMPONENTS = (() => {
  const names = new Set<string>();
  for (const { src } of FILES) {
    const re = /(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=)/g;
    const decls: Array<{ name: string; at: number }> = [];
    for (let m; (m = re.exec(src)); ) decls.push({ name: (m[1] ?? m[2])!, at: m.index });
    decls.forEach((d, i) => {
      const body = src.slice(d.at, decls[i + 1]?.at ?? src.length);
      if (/<form\b/.test(body)) names.add(d.name);
    });
  }
  names.delete("QuestionShell");
  return [...names];
})();

/** True when position `at` in `src` sits inside an open <tag>…</tag>: more
 * closing tags follow it than opening ones. Self-closing uses never count. */
function enclosedBy(src: string, at: number, tag: string): boolean {
  const after = src.slice(at);
  const opens = count(after, new RegExp(`<${tag}\\b`, "g"));
  const closes = count(after, new RegExp(`</${tag}>`, "g"));
  return closes > opens;
}

/** The component a position belongs to: the nearest preceding declaration. */
function enclosingComponent(src: string, at: number): string | null {
  const before = src.slice(0, at);
  const re = /(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=)/g;
  let last: string | null = null;
  for (let m; (m = re.exec(before)); ) last = (m[1] ?? m[2])!;
  return last;
}

describe("a sign-up form is never inside another form, anywhere", () => {
  it("finds the forms this exists for, and the components that contain a <form>", () => {
    expect(FORM_COMPONENTS).toEqual(expect.arrayContaining(["PlayerSave", "ParentSave", "SignupFlow"]));
  });

  it("no host of DiagnosticSaveForm / SignupFlow (or of their hosts, up the tree) wraps them in a form", () => {
    const seen = new Set<string>();
    let targets = [...SIGNUP_FORMS];
    const hosts: string[] = [];
    const problems: string[] = [];
    for (let depth = 0; depth < 6 && targets.length; depth++) {
      const next: string[] = [];
      for (const target of targets) {
        if (seen.has(target)) continue;
        seen.add(target);
        for (const { file, src } of FILES) {
          const re = new RegExp(`<${target}\\b`, "g");
          for (let m; (m = re.exec(src)); ) {
            hosts.push(`${file}: <${target}>`);
            for (const tag of ["form", ...FORM_COMPONENTS]) {
              if (tag !== target && enclosedBy(src, m.index, tag)) problems.push(`${file}: <${target}> is inside <${tag}>`);
            }
            const parent = enclosingComponent(src, m.index);
            if (parent && parent !== target) next.push(parent);
          }
        }
      }
      targets = next;
    }
    // The walk really reached the known hosts.
    expect(hosts).toEqual(
      expect.arrayContaining([
        "components/seeded/onboarding/diagnostic/diagnostic-flow.tsx: <DiagnosticSaveForm>",
        "components/seeded/onboarding/seeded-pre-auth-onboarding.tsx: <DiagnosticSaveForm>",
        "app/signup/page.tsx: <SignupFlow>",
        "app/parent-signup/page.tsx: <SignupFlow>",
      ])
    );
    expect(problems).toEqual([]);
  });

  it("the guard catches a wrapper (self-test on a synthetic host)", () => {
    const src = `function Host() { return (<form onSubmit={(e) => e.preventDefault()}><div><DiagnosticSaveForm answers={a} idPrefix="x" /></div></form>); }`;
    expect(enclosedBy(src, src.indexOf("<DiagnosticSaveForm"), "form")).toBe(true);
    const ok = `function Host() { return (<div><DiagnosticSaveForm answers={a} idPrefix="x" /></div>); }`;
    expect(enclosedBy(ok, ok.indexOf("<DiagnosticSaveForm"), "form")).toBe(false);
  });

  it("the diagnostic card (QuestionShell) is a <div> on the save step, a <form> otherwise", () => {
    const flow = FILES.find((f) => f.file === "components/seeded/onboarding/diagnostic/diagnostic-flow.tsx")!.src;
    expect(flow).toMatch(/<QuestionShell\s+asForm=\{view !== "save"\}/);
    const shell = flow.slice(flow.indexOf("function QuestionShell"));
    expect(shell).toMatch(/if \(!asForm\) return <div \{\.\.\.rest\}>\{children\}<\/div>;/);
    expect(flow.match(/<DiagnosticSaveForm\b/g)).toHaveLength(1);
    const before = flow.slice(0, flow.indexOf("<DiagnosticSaveForm"));
    expect(before.lastIndexOf('view === "save" ?')).toBeGreaterThan(before.lastIndexOf("<QuestionShell"));
  });
});
