import { describe, expect, it } from "vitest";
import { isEditableTarget } from "./keyboard-shortcuts";

// Plain mock objects shaped like real DOM nodes — this project's vitest
// environment is plain "node" (no jsdom), and isEditableTarget duck-types
// its input for exactly this reason; see that file's comment.
function el(tagName: string, isContentEditable = false): EventTarget {
  return { tagName, isContentEditable } as unknown as EventTarget;
}

describe("isEditableTarget", () => {
  it("treats a text input as editable", () => {
    expect(isEditableTarget(el("INPUT"))).toBe(true);
  });

  it("treats a textarea as editable", () => {
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true);
  });

  it("treats a select as editable", () => {
    expect(isEditableTarget(el("SELECT"))).toBe(true);
  });

  it("treats a contentEditable div as editable", () => {
    expect(isEditableTarget(el("DIV", true))).toBe(true);
  });

  it("does not treat a plain div as editable", () => {
    expect(isEditableTarget(el("DIV"))).toBe(false);
  });

  it("does not treat a button as editable", () => {
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it("returns false for a non-element EventTarget shape", () => {
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
});
