import { describe, expect, it } from "vitest";
import { TrainingTemplateBodySchema } from "./training-templates";

describe("TrainingTemplateBodySchema", () => {
  it("accepts a valid new template (no id)", () => {
    const result = TrainingTemplateBodySchema.safeParse({
      name: "Serve block",
      templateType: "session",
      description: "A focused serve session",
      payload: { typeId: "court", duration: 60 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid update (with id)", () => {
    const result = TrainingTemplateBodySchema.safeParse({
      id: "t1",
      name: "Serve block",
      templateType: "plan",
      description: "",
      payload: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid templateType", () => {
    const result = TrainingTemplateBodySchema.safeParse({
      name: "Serve block",
      templateType: "workout",
      description: "",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const result = TrainingTemplateBodySchema.safeParse({
      templateType: "session",
      description: "",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    const result = TrainingTemplateBodySchema.safeParse({
      name: "Serve block",
      templateType: "session",
      description: "",
      payload: "not an object",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a completely malformed body", () => {
    expect(TrainingTemplateBodySchema.safeParse(null).success).toBe(false);
    expect(TrainingTemplateBodySchema.safeParse({}).success).toBe(false);
  });
});
