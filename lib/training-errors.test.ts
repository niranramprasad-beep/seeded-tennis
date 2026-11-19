import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TrainingWriteError, trainingSaveErrorMessage } from "@/lib/db/training";

// Reviewer finding (PR C): /api/training/sessions returned err.message and the
// calendar's toast showed it as-is, so an under-13 account awaiting consent
// read "new row violates row-level security policy for table
// workout_sessions". Every failure is now plain words.

const RAW = /row-level security|violates|policy|relation|column|syntax|duplicate key|PGRST|42501|53400|null value/i;

describe("trainingSaveErrorMessage", () => {
  it("RLS refusal: names consent when the caller is pending, never the policy text", () => {
    const err = new TrainingWriteError('new row violates row-level security policy for table "workout_sessions"', "42501");
    const pending = trainingSaveErrorMessage(err, true);
    expect(pending).toBe("Your account can't add sessions until a parent in your family gives consent.");
    const other = trainingSaveErrorMessage(err, false);
    expect(other).toMatch(/^Your account can't add sessions yet\./);
    for (const m of [pending, other]) expect(m).not.toMatch(RAW);
  });

  it("rate limit, invalid values, missing row and anything else", () => {
    expect(trainingSaveErrorMessage(new TrainingWriteError("rate limit exceeded for training_write", "53400"))).toBe(
      "Too many changes at once. Wait a few minutes, then try again."
    );
    expect(trainingSaveErrorMessage(new TrainingWriteError('new row for relation "workout_sessions" violates check constraint', "23514"))).toMatch(/isn't valid/);
    expect(trainingSaveErrorMessage(new TrainingWriteError("That session no longer exists.", "not_found"))).toMatch(/no longer exists/);
    for (const e of [new Error('column "x" does not exist'), new TrainingWriteError("weird", "XX000"), "boom", null]) {
      const m = trainingSaveErrorMessage(e);
      expect(m).toBe("Couldn't save your session. Check your connection and try again.");
      expect(m).not.toMatch(RAW);
    }
  });

  it("the route never sends an error's own message", () => {
    const src = readFileSync("app/api/training/sessions/route.ts", "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/err(or)?\.message/);
    expect(src).toMatch(/trainingSaveErrorMessage\(err, consentPending\)/);
  });
});
