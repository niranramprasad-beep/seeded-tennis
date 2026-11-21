import { afterEach, describe, expect, it, vi } from "vitest";
import {
  errorCodeOf,
  logServerError,
  logServerEvent,
  MAX_SANITIZE_INPUT,
  sanitizeLogText,
  serverErrorRecord,
} from "./server-log";

// P1-OPS-2. What lib/server-log.ts writes to Vercel's runtime logs, pinned.
// Every value below is fake; none of it belongs to anyone.

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("sanitizeLogText", () => {
  it("strips email addresses, plain and URL-encoded", () => {
    const out = sanitizeLogText("no profile for Fake.Person+tag@example.com or other%40example.org");
    expect(out).not.toMatch(/example\.(com|org)/);
    expect(out).not.toContain("Fake.Person");
    expect(out.match(/\[email\]/g)).toHaveLength(2);
  });

  it("strips JWTs", () => {
    const out = sanitizeLogText(`token was ${JWT} and expired`);
    expect(out).not.toContain("eyJ");
    expect(out).not.toContain("SflKxwRJ");
    expect(out).toContain("[jwt]");
    expect(out).toContain("and expired");
  });

  it("strips Bearer / Basic authorization values", () => {
    const out = sanitizeLogText("header Authorization: Bearer abc.def-123_ghi, retrying; Basic dXNlcjpwYXNz");
    expect(out).not.toContain("abc.def-123_ghi");
    expect(out).not.toContain("dXNlcjpwYXNz");
    expect(out).toContain("Bearer [redacted]");
    expect(out).toContain("Basic [redacted]");
    expect(sanitizeLogText("bearer abc123xyz")).toBe("bearer [redacted]");
    // Ordinary words are not credentials.
    expect(sanitizeLogText("JWT token expired; basic check failed")).toBe("JWT token expired; basic check failed");
  });

  it("strips provider keys: sk_/pk_/rk_, whsec_, apik_, sb_secret_, sk-", () => {
    const fakes = [
      "sk_live_FAKE-not-a-real-key",
      "sk_test_FAKE1234",
      "pk_live_FAKE5678abcd",
      "rk_live_FAKE9999",
      "whsec_FAKEc2VjcmV0aGVyZQ",
      "apik_FAKEaaaabbbbcccc",
      "sb_secret_FAKEdddd1111",
      "sb_publishable_FAKEeeee2222",
      "sk-ant-FAKE-not-a-real-key",
      "ghp_FAKE-not-a-real-token",
    ];
    for (const key of fakes) {
      const out = sanitizeLogText(`failed with key ${key} today`);
      expect(out, key).not.toContain(key);
      expect(out, key).toContain("[key]");
      expect(out, key).toContain("today");
    }
  });

  it("strips secrets carried in a URL (the GA4 Measurement Protocol URL)", () => {
    const out = sanitizeLogText(
      "request to https://www.google-analytics.com/mp/collect?measurement_id=G-FAKE&api_secret=FAKEsecretVALUE failed"
    );
    expect(out).not.toContain("FAKEsecretVALUE");
    expect(out).toContain("api_secret=[redacted]");
    expect(out).toContain("failed");
    expect(sanitizeLogText("?apikey=abc123&x=1")).not.toContain("abc123");
    expect(sanitizeLogText("&access_token=zzz999")).not.toContain("zzz999");
  });

  it("drops a Postgres error's DETAIL, HINT and row values but keeps the useful part", () => {
    const pg =
      'duplicate key value violates unique constraint "profiles_email_key"\nDETAIL:  Key (email)=(fake.parent@example.com) already exists.';
    const out = sanitizeLogText(pg);
    expect(out).toBe('duplicate key value violates unique constraint "profiles_email_key"');

    const inline = 'new row for relation "budget_expenses" violates check constraint "budget_expenses_amount_check" DETAIL: Failing row contains (11111111-2222-3333-4444-555555555555, -5, Fake label).';
    const out2 = sanitizeLogText(inline);
    expect(out2).toContain('violates check constraint "budget_expenses_amount_check"');
    expect(out2).not.toContain("Fake label");
    expect(out2).not.toContain("DETAIL");

    const keyOnly = sanitizeLogText("Key (family_code, user_id)=(FAKEFAM-A1, someone) is not present");
    expect(keyOnly).toContain("Key (family_code, user_id)=([redacted])");
    expect(keyOnly).not.toContain("FAKEFAM-A1");

    const failing = sanitizeLogText("check failed: Failing row contains (1, secret-ish value)");
    expect(failing).toBe("check failed:");
  });

  it("strips UUIDs (user and row ids)", () => {
    const out = sanitizeLogText("no row for user 0b5a6f7e-1c2d-4e3f-8a9b-0c1d2e3f4a5b");
    expect(out).toBe("no row for user [uuid]");
  });

  it("strips long random tokens but keeps long constraint names", () => {
    expect(sanitizeLogText("session a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8 rejected")).toBe("session [token] rejected");
    expect(sanitizeLogText('violates check constraint "tournaments_planned_season_check"')).toContain(
      "tournaments_planned_season_check"
    );
  });

  it("keeps only the first line (no stack trace) and caps the length", () => {
    expect(sanitizeLogText("boom\n    at handler (/var/task/app/api/x/route.js:1:2)")).toBe("boom");
    // A second line with no recognisable marker is still not the message.
    expect(sanitizeLogText("could not save\nrow: Fake Name, 2009, Fake School")).toBe("could not save");
    expect(sanitizeLogText("x".repeat(1000)).length).toBeLessThanOrEqual(301);
  });

  it("cuts huge input before any regex runs (no quadratic blow-up on 50 KB+)", () => {
    expect(MAX_SANITIZE_INPUT).toBe(2_000);
    const nasty = [
      "a".repeat(200_000),
      "Key (x)=(" + "(".repeat(100_000),
      "-".repeat(200_000) + "@",
      "Bearer" + " ".repeat(200_000),
      "a1".repeat(100_000),
    ];
    for (const input of nasty) {
      const t = performance.now();
      const out = sanitizeLogText(input);
      expect(performance.now() - t, input.slice(0, 12)).toBeLessThan(200);
      expect(out.length).toBeLessThanOrEqual(301);
    }
  });

  it("strips E.164 phone numbers and leaves dates, codes and counts alone", () => {
    expect(sanitizeLogText("sms to +15555550123 failed")).toBe("sms to [phone] failed");
    expect(sanitizeLogText("on 2026-11-21, code 23514, 12345678 rows")).toBe("on 2026-11-21, code 23514, 12345678 rows");
  });
});

describe("errorCodeOf", () => {
  it("reads a SQLSTATE or short code, and nothing else", () => {
    expect(errorCodeOf({ code: "42501" })).toBe("42501");
    expect(errorCodeOf({ code: "not_found" })).toBe("not_found");
    expect(errorCodeOf({ code: "has spaces and fake@example.com" })).toBeNull();
    expect(errorCodeOf({ code: 42 })).toBeNull();
    expect(errorCodeOf(new Error("x"))).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
  });
});

describe("serverErrorRecord / logServerError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes exactly one JSON line with the stable shape", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error('new row violates row-level security policy for table "matches"'), {
      code: "42501",
      details: "Failing row contains (fake.player@example.com)",
      hint: "secret hint",
    });
    logServerError("api.matches.write_failed", err, { route: "/api/matches", kind: "save" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toHaveLength(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("\n");
    const rec = JSON.parse(line);
    expect(Object.keys(rec).sort()).toEqual(["code", "context", "event", "level", "message", "route", "ts"]);
    expect(rec).toMatchObject({
      level: "error",
      event: "api.matches.write_failed",
      route: "/api/matches",
      message: 'new row violates row-level security policy for table "matches"',
      code: "42501",
      context: { kind: "save" },
    });
    expect(new Date(rec.ts).toString()).not.toBe("Invalid Date");
    // details / hint / stack are never written
    expect(line).not.toContain("example.com");
    expect(line).not.toContain("secret hint");
    expect(line).not.toMatch(/\bat \S+ \(/);
    expect(line).not.toContain("server-log.test");
  });

  it("never writes a stack trace, even for an Error whose stack has values in it", () => {
    const err = new Error("failed for fake@example.com");
    err.stack = "Error: failed for fake@example.com\n    at x (/var/task/route.js:1:1)";
    const rec = serverErrorRecord("e", err);
    expect(JSON.stringify(rec)).not.toContain("route.js");
    expect(rec.message).toBe("failed for [email]");
  });

  it("sanitises context strings and redacts sensitive keys whatever their value", () => {
    const rec = serverErrorRecord("e", null, {
      route: "/api/x",
      email: "fake@example.com",
      userId: "not-even-a-uuid",
      supabaseUserId: "0b5a6f7e-1c2d-4e3f-8a9b-0c1d2e3f4a5b",
      accessToken: "abc",
      authorization: "Bearer abc",
      body: '{"name":"Fake"}',
      note: `got ${JWT}`,
      hasEmail: true,
      count: 3,
      bad: Number.NaN,
      skipped: undefined,
    });
    expect(rec.context).toEqual({
      email: "[redacted]",
      userId: "[redacted]",
      supabaseUserId: "[redacted]",
      accessToken: "[redacted]",
      authorization: "[redacted]",
      body: "[redacted]",
      note: "got [jwt]",
      hasEmail: true,
      count: 3,
      bad: null,
    });
    expect(rec.message).toBe("");
    expect(rec.code).toBeNull();
  });

  it("redacts name / ip / tel / uid / phone / buyer keys as whole words, not as substrings", () => {
    const rec = serverErrorRecord("e", null, {
      name: "Fake Person",
      fullName: "Fake Person",
      buyer_name: "Fake Buyer",
      buyerEmail: "x",
      ip: "203.0.113.7",
      clientIp: "203.0.113.7",
      tel: "5550123",
      uid: "abc",
      phoneNumber: "5550123",
      // Harmless keys that CONTAIN those letters stay readable.
      membershipId: "mem_FAKE123",
      guide: "g",
      type: "membership.activated",
      tier: "player",
    });
    expect(rec.context).toEqual({
      name: "[redacted]",
      fullName: "[redacted]",
      buyer_name: "[redacted]",
      buyerEmail: "[redacted]",
      ip: "[redacted]",
      clientIp: "[redacted]",
      tel: "[redacted]",
      uid: "[redacted]",
      phoneNumber: "[redacted]",
      membershipId: "mem_FAKE123",
      guide: "g",
      type: "membership.activated",
      tier: "player",
    });
  });

  it("handles strings, plain objects and junk as the error", () => {
    expect(serverErrorRecord("e", "plain fake@example.com").message).toBe("plain [email]");
    expect(serverErrorRecord("e", { message: "obj", code: "23514" })).toMatchObject({ message: "obj", code: "23514" });
    expect(serverErrorRecord("e", 42).message).toBe("");
    expect(serverErrorRecord("e", undefined).message).toBe("");
  });

  it("never throws, even if serialisation does", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("console broke");
    });
    expect(() => logServerError("e", new Error("x"))).not.toThrow();
  });
});

describe("logServerEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info → console.log, warn → console.warn, one JSON line, no message/code", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logServerEvent("whop.webhook.event_ignored", { route: "/api/whop/webhook", type: "payment.succeeded" });
    logServerEvent("whop.webhook.membership_unmatched", { membershipId: "mem_FAKE123", email: "fake@example.com" }, "warn");
    expect(log).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const info = JSON.parse(log.mock.calls[0][0] as string);
    expect(Object.keys(info).sort()).toEqual(["context", "event", "level", "route", "ts"]);
    expect(info).toMatchObject({ level: "info", route: "/api/whop/webhook", context: { type: "payment.succeeded" } });
    const w = JSON.parse(warn.mock.calls[0][0] as string);
    expect(w).toMatchObject({ level: "warn", context: { membershipId: "mem_FAKE123", email: "[redacted]" } });
  });
});
