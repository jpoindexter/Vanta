import { beforeEach, describe, expect, it } from "vitest";

import {
  blankFeedback,
  feedbackText,
  readFeedbackDraft,
  saveFeedbackDraft,
} from "./feedback";

beforeEach(() => localStorage.clear());

describe("feedback draft", () => {
  it("starts without diagnostic facts or private runtime data", () => {
    expect(blankFeedback()).toEqual({
      kind: "bug",
      title: "",
      details: "",
      steps: "",
      includeFacts: false,
    });
  });

  it("retains the editable draft through a close and reopen", () => {
    const draft = {
      ...blankFeedback(),
      title: "My report",
      details: "What happened",
      steps: "1. Open chat",
    };
    expect(saveFeedbackDraft(draft)).toBe(true);
    expect(readFeedbackDraft()).toEqual(draft);
  });

  it("rejects invalid stored drafts and strips unknown fields", () => {
    localStorage.setItem("desktop:feedback-draft:v1", "{broken");
    expect(readFeedbackDraft()).toEqual(blankFeedback());
    saveFeedbackDraft({
      ...blankFeedback(),
      token: "not a report field",
    } as ReturnType<typeof blankFeedback>);
    expect(localStorage.getItem("desktop:feedback-draft:v1")).not.toContain(
      "token",
    );
  });

  it("only includes allowlisted build facts after explicit opt-in", () => {
    const draft = {
      ...blankFeedback(),
      title: "Title",
      details: "Exact description",
      steps: "Exact steps",
    };
    const facts = {
      appVersion: "1.2.3",
      platform: "darwin",
      electronVersion: "43",
      nodeVersion: "22",
      vantaRoot: "/private/project",
      token: "secret",
    };
    const withoutFacts = feedbackText(draft, facts);
    expect(withoutFacts).toContain("Exact description");
    expect(withoutFacts).not.toContain("1.2.3");
    const withFacts = feedbackText({ ...draft, includeFacts: true }, facts);
    expect(withFacts).toContain("1.2.3");
    expect(withFacts).not.toContain("/private/project");
    expect(withFacts).not.toContain("secret");
    expect(withFacts).not.toContain("token");
  });
});
