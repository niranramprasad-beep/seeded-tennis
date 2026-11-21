import { describe, expect, it } from "vitest";
import { loginHrefFor, safeLoginNext, safeRedirectPath } from "./auth";

// QA sweep 2026-11-20, M3: AuthGate (and the head script) now send a
// signed-out visitor to /login?next=<where they were going>.
describe("loginHrefFor / safeLoginNext", () => {
  it("carries the page and its query string, encoded", () => {
    expect(loginHrefFor("/outreach?school=stanford-m")).toBe(
      "/login?next=%2Foutreach%3Fschool%3Dstanford-m"
    );
    expect(loginHrefFor("/today")).toBe("/login?next=%2Ftoday");
    // Round-trips through URLSearchParams to the same path /login reads.
    const next = new URLSearchParams(loginHrefFor("/plan?tab=week&x=1").split("?")[1]).get("next");
    expect(safeLoginNext(next)).toBe("/plan?tab=week&x=1");
  });

  it("falls back to a bare /login for anything that is not a same-origin path", () => {
    for (const p of [
      null,
      undefined,
      "",
      "/",
      "//evil.example",
      "//evil.example/today",
      "/\\evil.example",
      "https://evil.example/today",
      "javascript:alert(1)",
      "today",
      "/\n/evil.example",
    ]) {
      expect(loginHrefFor(p), String(p)).toBe("/login");
    }
  });

  it("never sends a signed-in user back to an auth page (a /login → /login loop)", () => {
    for (const p of ["/login", "/login?next=%2Ftoday", "/signup", "/parent-signup", "/reset-password", "/auth/callback", "/auth"]) {
      expect(safeLoginNext(p), p).toBeNull();
      expect(loginHrefFor(p), p).toBe("/login");
    }
    // A look-alike prefix is an ordinary page.
    expect(safeLoginNext("/login-help")).toBe("/login-help");
    expect(safeLoginNext("/authors")).toBe("/authors");
  });
});

// An open redirect on the OAuth callback is worth more to an attacker than
// on any other page: the victim arrives having just authenticated, from a
// link that genuinely started on seededtennis.com. Every case below is one a
// plain `startsWith("/")` check lets through.

describe("safeRedirectPath", () => {
  it("allows ordinary same-origin paths", () => {
    for (const p of ["/today", "/schools/stanford-m", "/plan?tab=week", "/settings#billing", "/"]) {
      expect(safeRedirectPath(p)).toBe(p);
    }
  });

  it("rejects protocol-relative URLs", () => {
    // The one that bites: starts with "/", and the browser reads it as a host.
    expect(safeRedirectPath("//evil.example")).toBeNull();
    expect(safeRedirectPath("//evil.example/path")).toBeNull();
  });

  it("rejects backslash variants browsers normalise to a slash", () => {
    expect(safeRedirectPath("/\\evil.example")).toBeNull();
    expect(safeRedirectPath("/path\\..\\..")).toBeNull();
  });

  it("rejects absolute URLs and non-navigations", () => {
    for (const p of [
      "https://evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:a@b.c",
    ]) {
      expect(safeRedirectPath(p), p).toBeNull();
    }
  });

  it("rejects control characters used to smuggle a scheme", () => {
    expect(safeRedirectPath("/\u0000//evil.example")).toBeNull();
    expect(safeRedirectPath("/\n/evil.example")).toBeNull();
    expect(safeRedirectPath("/\u007f/evil")).toBeNull();
  });

  it("rejects nothing-at-all rather than returning something", () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath("")).toBeNull();
    expect(safeRedirectPath("   ")).toBeNull();
    // No leading slash means it is not a path we recognise.
    expect(safeRedirectPath("today")).toBeNull();
  });
});
