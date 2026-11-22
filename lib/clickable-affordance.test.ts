import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Herdy's design review (docs/DECISIONS.md 2026-11-22): tiles and cards that
// LOOK clickable — hover lift / shadow / grow, cursor-pointer, the
// `interactive` card prop — but are not a link or a button. Each one found in
// the 2026-11-22 audit was either made a real link or lost the affordance;
// this scan keeps new ones out. It parses every .tsx under app/ and
// components/ and fails on such an element unless it is itself a link,
// button, label, summary or form control, has its own onClick/href/role, or
// sits inside one of those.


/** Classes that tell a mouse user "this moves when you point at it, click it". */
const LIFT_CLASS = /(?:^|[\s"'`:])(?:hover:-?translate-[xy]-|hover:shadow-|hover:scale-|active:scale-|cursor-pointer(?:\s|$|["'`]))/;

const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "label",
  "summary",
  "select",
  "input",
  "textarea",
  "option",
  "Link",
  "Button",
  "WhopLink",
  "motion.button",
  "motion.a",
]);

const INTERACTIVE_ROLES = new Set(["button", "link", "tab", "option", "menuitem", "checkbox", "radio", "switch"]);

interface AffordanceHit {
  file: string;
  line: number;
  tag: string;
  reason: string;
}

function tagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function attr(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name
  );
}

function attrText(node: ts.JsxOpeningLikeElement, name: string): string | null {
  const a = attr(node, name);
  if (!a) return null;
  return a.initializer ? a.initializer.getText() : "true";
}

/** Is this element itself something you can click or focus? */
function isInteractive(node: ts.JsxOpeningLikeElement): boolean {
  if (INTERACTIVE_TAGS.has(tagName(node))) return true;
  if (attr(node, "onClick") || attr(node, "href") || attr(node, "htmlFor")) return true;
  const role = attrText(node, "role");
  if (role && INTERACTIVE_ROLES.has(role.replace(/["'{}`]/g, ""))) return true;
  return false;
}

function openingOf(node: ts.Node): ts.JsxOpeningLikeElement | null {
  if (ts.isJsxElement(node)) return node.openingElement;
  if (ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

/** Inside a link/button (or an element with its own click handler)? */
function hasInteractiveAncestor(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    const o = openingOf(p);
    if (o && isInteractive(o)) return true;
  }
  return false;
}

function scanAffordances(file: string, source: string): AffordanceHit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: AffordanceHit[] = [];

  const visit = (node: ts.Node) => {
    const o = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (o) {
      const cls = attrText(o, "className") ?? "";
      const tag = tagName(o);
      const interactiveProp = /^(Card|SeededCard)$/.test(tag) && attr(o, "interactive") !== undefined;
      const reason = interactiveProp
        ? `<${tag} interactive>`
        : LIFT_CLASS.test(cls)
          ? (cls.match(LIFT_CLASS)?.[0] ?? "").trim().replace(/^["'`:]/, "")
          : null;
      const elementNode = ts.isJsxSelfClosingElement(node) ? node : node;
      if (reason && !isInteractive(o) && !hasInteractiveAncestor(elementNode)) {
        hits.push({
          file,
          line: sf.getLineAndCharacterOfPosition(o.getStart()).line + 1,
          tag,
          reason,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(p);
  }
  return out;
}

// The two card primitives define the lift for callers that ARE links; the
// definition itself is not a use.
const PRIMITIVES = new Set(["components/ui/card.tsx", "components/seeded/ui/card.tsx"]);

describe("nothing looks clickable unless it is", () => {
  it("no hover lift / cursor-pointer / interactive card outside a link or button", () => {
    const hits: AffordanceHit[] = [];
    for (const f of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))]) {
      const rel = relative(ROOT, f);
      if (PRIMITIVES.has(rel)) continue;
      hits.push(...scanAffordances(rel, readFileSync(f, "utf8")));
    }
    expect(hits.map((h) => `${h.file}:${h.line} <${h.tag}> ${h.reason}`)).toEqual([]);
  });

  it("Badge is a label: no hover grow or brighten", () => {
    const src = readFileSync(join(ROOT, "components/ui/badge.tsx"), "utf8");
    expect(src).not.toMatch(/hover:scale|hover:brightness/);
  });

  describe("the scanner itself", () => {
    const scan = (s: string) => scanAffordances("x.tsx", s);
    it("flags a lifted div", () => {
      expect(scan(`export const A = () => <div className="rounded hover:shadow-lift">x</div>;`)).toHaveLength(1);
      expect(scan(`export const A = () => <div className={cn("p-4", "hover:-translate-y-0.5")}>x</div>;`)).toHaveLength(1);
      expect(scan(`export const A = () => <li className="cursor-pointer">x</li>;`)).toHaveLength(1);
      expect(scan(`export const A = () => <Card interactive>x</Card>;`)).toHaveLength(1);
    });
    it("accepts the same inside a link or button, or with its own handler", () => {
      expect(scan(`export const A = () => <Link href="/x"><div className="hover:shadow-lift">x</div></Link>;`)).toEqual([]);
      expect(scan(`export const A = () => <a href="/x" className="hover:shadow-lift">x</a>;`)).toEqual([]);
      expect(scan(`export const A = () => <button className="cursor-pointer">x</button>;`)).toEqual([]);
      expect(scan(`export const A = () => <div onClick={f} className="cursor-pointer">x</div>;`)).toEqual([]);
      expect(scan(`export const A = () => <Link href="/x"><Card interactive>x</Card></Link>;`)).toEqual([]);
    });
    it("ignores plain hover colours (links, nav rows) — those are not a lift", () => {
      expect(scan(`export const A = () => <div className="hover:bg-cream">x</div>;`)).toEqual([]);
    });
  });
});
