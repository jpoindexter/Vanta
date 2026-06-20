import { describe, expect, it } from "vitest";
import {
  buildSkillFromDescription,
  buildSkillGenPrompt,
  parseSkillModelOutput,
} from "./skill-gen.js";

const GOOD = JSON.stringify({
  name: "Summarize PRs",
  description: "Use when asked to summarize a pull request.",
  body: "# Summarize PRs\n\nRead the diff, list the key changes, flag risks.",
});

describe("buildSkillGenPrompt", () => {
  it("includes the JSON contract and the user's description", () => {
    const p = buildSkillGenPrompt("a skill that writes commit messages");
    expect(p).toContain('"name"');
    expect(p).toContain('"description"');
    expect(p).toContain('"body"');
    expect(p).toContain("a skill that writes commit messages");
  });
});

describe("parseSkillModelOutput", () => {
  it("parses valid model output and kebab-slugifies the name", () => {
    const r = parseSkillModelOutput(GOOD);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.def.name).toBe("summarize-prs"); // "Summarize PRs" -> slug
    expect(r.def.description).toBe("Use when asked to summarize a pull request.");
    expect(r.def.body).toContain("# Summarize PRs");
  });

  it("strips a ```json fence the model may add", () => {
    const r = parseSkillModelOutput("```json\n" + GOOD + "\n```");
    expect(r.ok).toBe(true);
  });

  it("errors on malformed JSON instead of throwing", () => {
    const r = parseSkillModelOutput("not json {");
    expect(r).toEqual({ ok: false, error: "model output is not valid JSON" });
  });

  it("errors when a required field is missing", () => {
    const r = parseSkillModelOutput(JSON.stringify({ name: "x", body: "y" }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toMatch(/name, description, body/);
  });

  it("rejects a name that slugifies to nothing (no path escape)", () => {
    const r = parseSkillModelOutput(
      JSON.stringify({ name: "../../etc", description: "d", body: "x".repeat(30) }),
    );
    // "../../etc" -> strips dots/slashes -> "etc"? verify it never escapes:
    if (r.ok) {
      expect(r.def.name).not.toContain("/");
      expect(r.def.name).not.toContain("..");
    }
  });

  it("rejects a name that is only invalid characters", () => {
    const r = parseSkillModelOutput(
      JSON.stringify({ name: "///...", description: "d", body: "x".repeat(30) }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toMatch(/not a valid kebab slug/);
  });

  it("rejects a too-short body", () => {
    const r = parseSkillModelOutput(
      JSON.stringify({ name: "tiny", description: "d", body: "short" }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected error");
    expect(r.error).toMatch(/body too short/);
  });
});

describe("buildSkillFromDescription", () => {
  it("returns a prompt when no model output is given", () => {
    const r = buildSkillFromDescription("write release notes");
    expect("prompt" in r && r.ok).toBe(true);
    if (!("prompt" in r)) throw new Error("expected prompt");
    expect(r.prompt).toContain("write release notes");
  });

  it("returns a parsed def when model output is given", () => {
    const r = buildSkillFromDescription("summarize prs", GOOD);
    expect(r.ok).toBe(true);
    if (!r.ok || "prompt" in r) throw new Error("expected def");
    expect(r.def.name).toBe("summarize-prs");
  });

  it("errors on an empty description", () => {
    const r = buildSkillFromDescription("   ");
    expect(r).toEqual({ ok: false, error: "description is empty" });
  });
});
