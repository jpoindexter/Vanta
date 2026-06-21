import { describe, it, expect } from "vitest";
import { UxSettingsSchema, uxSettingsToEnv } from "./ux-settings.js";

describe("UxSettingsSchema", () => {
  it("accepts an empty block", () => {
    const parsed = UxSettingsSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("accepts a fully-populated block", () => {
    const parsed = UxSettingsSchema.safeParse({
      spinnerVerbs: ["Thinking", "Working"],
      messageTimestamps: true,
      timestampStyle: "absolute",
      effortIndicator: true,
      terminalTitle: false,
      hyperlinks: true,
      awaySummaryMs: 30000,
      idleReturn: false,
      jsonFormat: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown key (strict)", () => {
    const parsed = UxSettingsSchema.safeParse({ nope: 1 });
    expect(parsed.success).toBe(false);
  });

  it("rejects an out-of-range timestampStyle", () => {
    const parsed = UxSettingsSchema.safeParse({ timestampStyle: "epoch" });
    expect(parsed.success).toBe(false);
  });
});

describe("uxSettingsToEnv", () => {
  it("returns no env keys for an unset block (current behavior)", () => {
    expect(uxSettingsToEnv(undefined)).toEqual({});
  });

  it("returns no env keys for an empty block", () => {
    expect(uxSettingsToEnv({})).toEqual({});
  });

  it("only emits env keys for fields that are set", () => {
    expect(uxSettingsToEnv({ jsonFormat: true })).toEqual({ VANTA_JSON_FORMAT: "1" });
  });

  it("maps spinnerVerbs to a comma-joined list", () => {
    expect(uxSettingsToEnv({ spinnerVerbs: ["Thinking", "Working", "Cooking"] })).toEqual({
      VANTA_SPINNER_VERBS: "Thinking,Working,Cooking",
    });
  });

  it("maps an empty spinnerVerbs array to an empty string", () => {
    expect(uxSettingsToEnv({ spinnerVerbs: [] })).toEqual({ VANTA_SPINNER_VERBS: "" });
  });

  it("maps messageTimestamps boolean to 1/0", () => {
    expect(uxSettingsToEnv({ messageTimestamps: true })).toEqual({ VANTA_MSG_TIMESTAMPS: "1" });
    expect(uxSettingsToEnv({ messageTimestamps: false })).toEqual({ VANTA_MSG_TIMESTAMPS: "0" });
  });

  it("maps timestampStyle to its value", () => {
    expect(uxSettingsToEnv({ timestampStyle: "absolute" })).toEqual({
      VANTA_MSG_TIMESTAMP_STYLE: "absolute",
    });
    expect(uxSettingsToEnv({ timestampStyle: "relative" })).toEqual({
      VANTA_MSG_TIMESTAMP_STYLE: "relative",
    });
  });

  it("maps effortIndicator boolean to 1/0", () => {
    expect(uxSettingsToEnv({ effortIndicator: true })).toEqual({ VANTA_EFFORT_INDICATOR: "1" });
    expect(uxSettingsToEnv({ effortIndicator: false })).toEqual({ VANTA_EFFORT_INDICATOR: "0" });
  });

  it("maps terminalTitle boolean to 1/0", () => {
    expect(uxSettingsToEnv({ terminalTitle: true })).toEqual({ VANTA_TERMINAL_TITLE: "1" });
    expect(uxSettingsToEnv({ terminalTitle: false })).toEqual({ VANTA_TERMINAL_TITLE: "0" });
  });

  it("maps hyperlinks boolean to 1/0", () => {
    expect(uxSettingsToEnv({ hyperlinks: true })).toEqual({ VANTA_HYPERLINKS: "1" });
    expect(uxSettingsToEnv({ hyperlinks: false })).toEqual({ VANTA_HYPERLINKS: "0" });
  });

  it("maps awaySummaryMs to the number string", () => {
    expect(uxSettingsToEnv({ awaySummaryMs: 30000 })).toEqual({ VANTA_AWAY_SUMMARY_MS: "30000" });
    expect(uxSettingsToEnv({ awaySummaryMs: 0 })).toEqual({ VANTA_AWAY_SUMMARY_MS: "0" });
  });

  it("maps idleReturn boolean to 1/0", () => {
    expect(uxSettingsToEnv({ idleReturn: true })).toEqual({ VANTA_IDLE_RETURN: "1" });
    expect(uxSettingsToEnv({ idleReturn: false })).toEqual({ VANTA_IDLE_RETURN: "0" });
  });

  it("maps jsonFormat boolean to 1/0", () => {
    expect(uxSettingsToEnv({ jsonFormat: true })).toEqual({ VANTA_JSON_FORMAT: "1" });
    expect(uxSettingsToEnv({ jsonFormat: false })).toEqual({ VANTA_JSON_FORMAT: "0" });
  });

  it("maps every field at once", () => {
    expect(
      uxSettingsToEnv({
        spinnerVerbs: ["a", "b"],
        messageTimestamps: true,
        timestampStyle: "absolute",
        effortIndicator: false,
        terminalTitle: true,
        hyperlinks: false,
        awaySummaryMs: 12000,
        idleReturn: true,
        jsonFormat: false,
      }),
    ).toEqual({
      VANTA_SPINNER_VERBS: "a,b",
      VANTA_MSG_TIMESTAMPS: "1",
      VANTA_MSG_TIMESTAMP_STYLE: "absolute",
      VANTA_EFFORT_INDICATOR: "0",
      VANTA_TERMINAL_TITLE: "1",
      VANTA_HYPERLINKS: "0",
      VANTA_AWAY_SUMMARY_MS: "12000",
      VANTA_IDLE_RETURN: "1",
      VANTA_JSON_FORMAT: "0",
    });
  });
});
