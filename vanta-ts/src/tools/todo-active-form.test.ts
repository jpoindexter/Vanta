import { describe, it, expect } from "vitest";
import { displayLabel, normalizeActiveForm, type ActiveFormItem } from "./todo-active-form.js";

describe("displayLabel", () => {
  it("returns activeForm when in_progress and activeForm is non-empty", () => {
    const item: ActiveFormItem = { text: "Run the tests", status: "in_progress", activeForm: "Running the tests" };
    expect(displayLabel(item)).toBe("Running the tests");
  });

  it("returns content when in_progress and activeForm is absent", () => {
    const item: ActiveFormItem = { text: "Run the tests", status: "in_progress" };
    expect(displayLabel(item)).toBe("Run the tests");
  });

  it("returns content when in_progress and activeForm is blank", () => {
    const item: ActiveFormItem = { text: "Run the tests", status: "in_progress", activeForm: "   " };
    expect(displayLabel(item)).toBe("Run the tests");
  });

  it("returns content for pending items even when activeForm is set", () => {
    const item: ActiveFormItem = { text: "Run the tests", status: "pending", activeForm: "Running the tests" };
    expect(displayLabel(item)).toBe("Run the tests");
  });

  it("returns content for done items even when activeForm is set", () => {
    const item: ActiveFormItem = { text: "Run the tests", status: "done", activeForm: "Running the tests" };
    expect(displayLabel(item)).toBe("Run the tests");
  });

  it("returns content for an item with no activeForm field (current display)", () => {
    const item: ActiveFormItem = { text: "Plain task", status: "in_progress" };
    expect(displayLabel(item)).toBe("Plain task");
  });
});

describe("normalizeActiveForm", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeActiveForm("  Running the tests  ")).toBe("Running the tests");
  });

  it("returns undefined for an empty string", () => {
    expect(normalizeActiveForm("")).toBeUndefined();
  });

  it("returns undefined for a whitespace-only string", () => {
    expect(normalizeActiveForm("   \t ")).toBeUndefined();
  });

  it("returns undefined for a non-string value", () => {
    expect(normalizeActiveForm(undefined)).toBeUndefined();
    expect(normalizeActiveForm(null)).toBeUndefined();
    expect(normalizeActiveForm(42)).toBeUndefined();
  });

  it("returns the trimmed value for a valid non-empty string", () => {
    expect(normalizeActiveForm("Building the app")).toBe("Building the app");
  });
});
