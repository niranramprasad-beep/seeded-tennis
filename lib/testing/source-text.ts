import { readFileSync } from "node:fs";

// What a user would READ, recovered from source, for the copy guards.
//
// Every guard that greps source for a banned phrase has been defeated the
// same way: the source spells the phrase differently from the screen.
// `We&apos;ll` (JSX entity), `Bailey’s` (JS escape), `{"'"}` and
// `{" "}` (JSX expression joins), `&#39;` / `&#x27;` (numeric entities) and
// `${n} spots open` (a template slot where the number goes) all render as
// plain text and all slipped past patterns written for the plain text.
//
// This normalises all of them, so a pattern is written once, against the
// words on the screen. Test-only: imported by *.test.ts files.

const NAMED: Record<string, string> = {
  apos: "'", rsquo: "'", lsquo: "'", quot: '"', ldquo: '"', rdquo: '"',
  mdash: "—", ndash: "–", nbsp: " ", amp: "&", hellip: "…", middot: "·",
};

export function decodeSourceText(src: string): string {
  return (
    src
      // JS string escapes for quotes/apostrophes/spaces
      .replace(/\\u2019|\\u2018|\\u0027|\\x27/gi, "'")
      .replace(/\\u201c|\\u201d|\\u0022|\\x22/gi, '"')
      .replace(/\\u00a0/gi, " ")
      .replace(/\\u2014/gi, "—")
      .replace(/\\u2013/gi, "–")
      // numeric HTML entities
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      // named HTML entities
      .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
      // JSX expression joins: {" "}, {"'"}, {'s'}
      .replace(/\{\s*(["'`])((?:(?!\1).){0,3})\1\s*\}/g, "$2")
      // curly quotes -> straight, so one pattern covers both
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
  );
}

/** Comments removed (they may quote removed copy on purpose), text decoded,
 * and every `${…}` template slot replaced by a digit so that
 * `${n} spots open` is matched by a pattern written for "3 spots open". */
export function readableSource(file: string): string {
  const raw = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  return decodeSourceText(raw).replace(/\$\{[^}]*\}/g, "7");
}

/** Code with comments removed but NOT decoded — for identifier checks. */
export function codeOnly(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
