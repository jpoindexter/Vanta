import { describe, expect, it } from "vitest";
import { validateAskInput } from "./ask-user-model.js";

function option(label: string) {
  return { label, description: `${label} description` };
}

describe("validateAskInput", () => {
  it("repairs an overlong model-generated header instead of rejecting the question", () => {
    const result = validateAskInput({
      questions: [{
        header: "Repository location",
        question: "Where should I create the project?",
        options: [option("Sibling repo"), option("Current repo")],
      }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions[0]?.header).toBe("Repository");
    expect(result.questions[0]?.header.length).toBeLessThanOrEqual(12);
  });

  it("keeps repaired headers unique so answers cannot overwrite each other", () => {
    const result = validateAskInput({
      questions: [
        {
          header: "Deployment destination",
          question: "Where should this deploy?",
          options: [option("Local"), option("Cloud")],
        },
        {
          header: "Deployment details",
          question: "Which setup should this use?",
          options: [option("Default"), option("Custom")],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.questions.map((question) => question.header)).toEqual(["Deployment", "Deployment 2"]);
  });
});
