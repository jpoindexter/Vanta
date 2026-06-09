import { describe, it, expect } from "vitest";
import { formatTriageResult, buildTriagePrompt } from "./comms-triage.js";
import type { TriageResult } from "./comms-triage.js";

describe("formatTriageResult", () => {
  it("all empty → 'nothing urgent in inbox/calendar'", () => {
    const result: TriageResult = { urgent: [], commitments: [], needsReply: [] };
    expect(formatTriageResult(result)).toBe("nothing urgent in inbox/calendar");
  });

  it("urgent items are shown with a header", () => {
    const result: TriageResult = {
      urgent: ["Reply to client by EOD", "Sign contract"],
      commitments: [],
      needsReply: [],
    };
    const out = formatTriageResult(result);
    expect(out).toContain("URGENT");
    expect(out).toContain("Reply to client by EOD");
    expect(out).toContain("Sign contract");
  });

  it("commitment items are shown", () => {
    const result: TriageResult = {
      urgent: [],
      commitments: ["Send draft to Alex"],
      needsReply: [],
    };
    const out = formatTriageResult(result);
    expect(out).toContain("COMMITMENTS");
    expect(out).toContain("Send draft to Alex");
    expect(out).not.toContain("URGENT");
    expect(out).not.toContain("NEEDS REPLY");
  });

  it("needs-reply items are shown", () => {
    const result: TriageResult = {
      urgent: [],
      commitments: [],
      needsReply: ["Invoice from contractor"],
    };
    const out = formatTriageResult(result);
    expect(out).toContain("NEEDS REPLY");
    expect(out).toContain("Invoice from contractor");
    expect(out).not.toContain("URGENT");
  });

  it("empty categories are omitted when others are present", () => {
    const result: TriageResult = {
      urgent: ["something"],
      commitments: [],
      needsReply: [],
    };
    const out = formatTriageResult(result);
    expect(out).not.toContain("COMMITMENTS");
    expect(out).not.toContain("NEEDS REPLY");
  });

  it("all three populated → all three sections appear", () => {
    const result: TriageResult = {
      urgent: ["u1"],
      commitments: ["c1"],
      needsReply: ["n1"],
    };
    const out = formatTriageResult(result);
    expect(out).toContain("URGENT");
    expect(out).toContain("COMMITMENTS");
    expect(out).toContain("NEEDS REPLY");
    expect(out).toContain("u1");
    expect(out).toContain("c1");
    expect(out).toContain("n1");
  });
});

describe("buildTriagePrompt", () => {
  it("includes gmail_search", () => {
    expect(buildTriagePrompt()).toContain("gmail_search");
  });

  it("includes calendar_read", () => {
    expect(buildTriagePrompt()).toContain("calendar_read");
  });

  it("default uses 24 hours", () => {
    expect(buildTriagePrompt()).toContain("24");
  });

  it("accepts a custom hours argument", () => {
    const prompt = buildTriagePrompt(48);
    expect(prompt).toContain("48");
    expect(prompt).toContain("gmail_search");
    expect(prompt).toContain("calendar_read");
  });

  it("classifies into the three expected categories", () => {
    const prompt = buildTriagePrompt();
    expect(prompt).toContain("urgent");
    expect(prompt).toContain("commitments");
    expect(prompt).toContain("needs-reply");
  });
});
