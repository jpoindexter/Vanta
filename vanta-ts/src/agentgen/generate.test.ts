import { describe, it, expect } from "vitest";
import {
  buildGeneratePrompt,
  parseAgentDefinition,
  agentFileContent,
  agentFilePath,
  AgentDefinitionSchema,
} from "./generate.js";

describe("buildGeneratePrompt", () => {
  it("includes the description and repo context", () => {
    const prompt = buildGeneratePrompt("an agent that reviews PRs", "stack: rust kernel + ts agent");
    expect(prompt).toContain("an agent that reviews PRs");
    expect(prompt).toContain("stack: rust kernel + ts agent");
    expect(prompt).toContain("Reply ONLY as minified JSON");
    expect(prompt).toContain("Description of the agent to create:");
    expect(prompt).toContain("Repository context:");
  });

  it("omits the repo-context section when context is blank", () => {
    const prompt = buildGeneratePrompt("a simple agent", "   ");
    expect(prompt).not.toContain("Repository context:");
    expect(prompt).toContain("a simple agent");
  });
});

describe("parseAgentDefinition", () => {
  const valid = JSON.stringify({
    identifier: "pr-reviewer",
    whenToUse: "Use when a pull request needs a structured review.",
    systemPrompt: "You are a meticulous PR reviewer. Check correctness, tests, and style.",
  });

  it("parses a valid minified JSON definition", () => {
    const res = parseAgentDefinition(valid);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.def.identifier).toBe("pr-reviewer");
    expect(res.def.whenToUse).toContain("pull request");
    expect(res.def.systemPrompt).toContain("PR reviewer");
  });

  it("tolerates surrounding prose / code fences around the JSON", () => {
    const wrapped = "Here you go:\n```json\n" + valid + "\n```\nHope that helps!";
    const res = parseAgentDefinition(wrapped);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.def.identifier).toBe("pr-reviewer");
  });

  it("errors-as-values when there is no JSON object", () => {
    const res = parseAgentDefinition("I cannot produce that.");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("no JSON object");
  });

  it("errors-as-values on malformed JSON", () => {
    const res = parseAgentDefinition("{ identifier: not-quoted }");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not valid JSON|invalid agent definition/);
  });

  it("rejects a non-kebab-case identifier", () => {
    const bad = JSON.stringify({ identifier: "PR Reviewer!", whenToUse: "x", systemPrompt: "y" });
    const res = parseAgentDefinition(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("kebab-case");
  });

  it("rejects a missing systemPrompt", () => {
    const bad = JSON.stringify({ identifier: "good-id", whenToUse: "x" });
    const res = parseAgentDefinition(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("invalid agent definition");
  });

  it("rejects an empty whenToUse", () => {
    const bad = JSON.stringify({ identifier: "good-id", whenToUse: "", systemPrompt: "y" });
    const res = parseAgentDefinition(bad);
    expect(res.ok).toBe(false);
  });
});

describe("agentFileContent", () => {
  it("renders YAML frontmatter + the system prompt body", () => {
    const def = AgentDefinitionSchema.parse({
      identifier: "doc-writer",
      whenToUse: "Use to draft documentation.",
      systemPrompt: "You write clear docs.",
    });
    const content = agentFileContent(def);
    expect(content).toContain("---\nname: doc-writer");
    expect(content).toContain("description: Use to draft documentation.");
    expect(content).toContain("You write clear docs.");
    // frontmatter is opened and closed before the body
    expect(content.indexOf("---")).toBe(0);
    expect(content.split("---").length).toBe(3);
  });

  it("quotes a whenToUse description that contains YAML-breaking characters", () => {
    const def = AgentDefinitionSchema.parse({
      identifier: "edge-agent",
      whenToUse: "Use when: the input has colons, #hashes, and 'quotes'.",
      systemPrompt: "Body.",
    });
    const content = agentFileContent(def);
    // the description line must be a quoted scalar so the colon doesn't break YAML
    const descLine = content.split("\n").find((l) => l.startsWith("description:"));
    expect(descLine).toBeDefined();
    expect(descLine).toContain('description: "');
  });
});

describe("agentFilePath", () => {
  it("places the file under <home>/agents/<identifier>.md", () => {
    expect(agentFilePath("pr-reviewer", "/tmp/vanta-home")).toBe("/tmp/vanta-home/agents/pr-reviewer.md");
  });
});
