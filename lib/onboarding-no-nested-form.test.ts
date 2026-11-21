import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";

// Final-check PR C (2026-11-21), found on the onboarding walk: the
// diagnostic's question card was a <form>, and its save step rendered
// DiagnosticSaveForm — another <form> — inside it. React does not prevent a
// submit from a form nested in a form, so "Create free account" (player) and
// "Create parent account" did a native GET of /onboarding: the page
// reloaded, every answer was lost and no account was created. Reproduced on
// a local build of main d3bc348 and of this branch before the fix.
//
// Fails the build if the save form can be nested in a form again.

const ROOT = join(__dirname, "..");
const flow = codeOnly(join(ROOT, "components/seeded/onboarding/diagnostic/diagnostic-flow.tsx"));
const save = codeOnly(join(ROOT, "components/seeded/onboarding/diagnostic/diagnostic-save.tsx"));

describe("the onboarding sign-up form is never inside another form", () => {
  it("DiagnosticSaveForm is a form itself (so it must not be nested)", () => {
    expect(save.match(/<form onSubmit=\{submit\}/g)).toHaveLength(2);
  });

  it("the question card renders a <div> on the save step, a <form> otherwise", () => {
    expect(flow).not.toMatch(/<form\b[^>]*>[\s\S]*<DiagnosticSaveForm/);
    expect(flow).toMatch(/<QuestionShell\s+asForm=\{view !== "save"\}/);
    const shell = flow.slice(flow.indexOf("function QuestionShell"));
    expect(shell).toMatch(/if \(!asForm\) return <div \{\.\.\.rest\}>\{children\}<\/div>;/);
    // The only <form> in the flow file is the shell's own.
    expect(flow.match(/<form\b/g)).toHaveLength(1);
  });

  it("the save step is the only place DiagnosticSaveForm renders inside the flow, and only when view is 'save'", () => {
    expect(flow.match(/<DiagnosticSaveForm\b/g)).toHaveLength(1);
    const at = flow.indexOf("<DiagnosticSaveForm");
    const before = flow.slice(0, at);
    expect(before.lastIndexOf('view === "save" ?')).toBeGreaterThan(before.lastIndexOf("<QuestionShell"));
  });
});
