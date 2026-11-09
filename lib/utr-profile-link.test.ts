import { describe, expect, it } from "vitest";
import { utrProfileLinkHref, validateUtrProfileLink } from "./utr-profile-link";

describe("validateUtrProfileLink — shape-only check, never a network call", () => {
  it("treats an empty or whitespace-only input as valid (field is optional)", () => {
    expect(validateUtrProfileLink("")).toEqual({ valid: true, error: null, normalized: "" });
    expect(validateUtrProfileLink("   ")).toEqual({ valid: true, error: null, normalized: "" });
  });

  it("accepts a full https:// UTR Sports profile URL", () => {
    const result = validateUtrProfileLink("https://app.utrsports.net/profiles/123456");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
    expect(result.normalized).toBe("https://app.utrsports.net/profiles/123456");
  });

  it("accepts http:// too", () => {
    const result = validateUtrProfileLink("http://app.utrsports.net/profiles/123456");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("http://app.utrsports.net/profiles/123456");
  });

  it("accepts a bare domain pasted with no scheme and normalizes it to https://", () => {
    const result = validateUtrProfileLink("app.utrsports.net/profiles/123456");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("https://app.utrsports.net/profiles/123456");
  });

  it("is case-insensitive on the host", () => {
    const result = validateUtrProfileLink("https://APP.UTRSPORTS.NET/profiles/123456");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("https://app.utrsports.net/profiles/123456");
  });

  it("accepts a vanity/slug id, not just a numeric one", () => {
    const result = validateUtrProfileLink("https://app.utrsports.net/profiles/jane-doe-t12345");
    expect(result.valid).toBe(true);
  });

  it("accepts trailing query params", () => {
    const result = validateUtrProfileLink("https://app.utrsports.net/profiles/123456?tab=results");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("https://app.utrsports.net/profiles/123456?tab=results");
  });

  it("rejects an arbitrary non-URL string", () => {
    const result = validateUtrProfileLink("not a url at all");
    expect(result.valid).toBe(false);
    expect(result.normalized).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("rejects a well-formed URL on the wrong domain", () => {
    const result = validateUtrProfileLink("https://instagram.com/my_profile");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/UTR Sports/);
  });

  it("rejects the UTR marketing domain (utrsports.net) without the app. subdomain", () => {
    const result = validateUtrProfileLink("https://utrsports.net/profiles/123456");
    expect(result.valid).toBe(false);
  });

  it("rejects the right domain on the wrong path", () => {
    const result = validateUtrProfileLink("https://app.utrsports.net/rankings/123456");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/profiles/);
  });

  it("rejects /profiles/ with nothing after it", () => {
    const result = validateUtrProfileLink("https://app.utrsports.net/profiles/");
    expect(result.valid).toBe(false);
  });

  it("rejects a non-http(s) scheme even on the right host/path", () => {
    const result = validateUtrProfileLink("ftp://app.utrsports.net/profiles/123456");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/http/);
  });
});

describe("utrProfileLinkHref — rendering an already-stored value", () => {
  it("passes through a value that already has a scheme", () => {
    expect(utrProfileLinkHref("https://app.utrsports.net/profiles/1")).toBe(
      "https://app.utrsports.net/profiles/1"
    );
  });

  it("adds https:// to a bare domain so it renders as an absolute link", () => {
    expect(utrProfileLinkHref("app.utrsports.net/profiles/1")).toBe(
      "https://app.utrsports.net/profiles/1"
    );
  });
});
