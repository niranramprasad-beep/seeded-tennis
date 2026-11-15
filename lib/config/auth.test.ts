import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./auth";

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
