import { describe, it, expect, vi } from "vitest";
import {
  parseLearnArg,
  classifySource,
  buildDistillPrompt,
  parseDistillResponse,
  runLearn,
  type LearnDeps,
} from "./learn-cmd.js";
import { gateSkill } from "../learning/eval-gate.js";

describe("parseLearnArg", () => {
  it("returns the bare source when no name is given", () => {
    expect(parseLearnArg("  https://x.com/doc  ")).toEqual({ source: "https://x.com/doc" });
  });
  it("splits '<source> as <name>'", () => {
    expect(parseLearnArg("docs/guide.md as deploy flow")).toEqual({ source: "docs/guide.md", name: "deploy flow" });
  });
});

describe("classifySource", () => {
  it("detects http(s) URLs", () => {
    expect(classifySource("https://a.b/c")).toBe("url");
    expect(classifySource("http://a.b")).toBe("url");
  });
  it("treats everything else as a path", () => {
    expect(classifySource("docs/x.md")).toBe("path");
    expect(classifySource("/abs/x.md")).toBe("path");
  });
});

describe("buildDistillPrompt", () => {
  it("includes the title, the doc text, and a JSON-only instruction", () => {
    const p = buildDistillPrompt("My Guide", "step one then step two");
    expect(p).toContain("My Guide");
    expect(p).toContain("step one then step two");
    expect(p).toMatch(/ONLY a JSON object/i);
  });
});

describe("parseDistillResponse", () => {
  it("parses a clean JSON object", () => {
    const r = parseDistillResponse('{"name":"x","description":"d","body":"## Procedure\\n1. go"}');
    expect(r).toEqual({ name: "x", description: "d", body: "## Procedure\n1. go" });
  });
  it("tolerates code fences / surrounding prose", () => {
    const raw = 'Here you go:\n```json\n{"name":"x","description":"d","body":"longer body here"}\n```';
    expect(parseDistillResponse(raw)?.name).toBe("x");
  });
  it("defaults a missing description but requires name + body", () => {
    expect(parseDistillResponse('{"name":"x","body":"b"}')?.description).toBe("A skill learned from a document.");
    expect(parseDistillResponse('{"name":"x"}')).toBeNull();
    expect(parseDistillResponse('{"body":"b"}')).toBeNull();
  });
  it("returns null on garbage", () => {
    expect(parseDistillResponse("not json at all")).toBeNull();
    expect(parseDistillResponse("{broken")).toBeNull();
  });
});

const now = () => new Date("2026-06-24T00:00:00Z");

function deps(over: Partial<LearnDeps> = {}): LearnDeps {
  return {
    fetchText: async () => ({ title: "Guide", text: "real document text with a procedure" }),
    distill: async () => '{"name":"deploy-flow","description":"how to deploy","body":"## Procedure\\n1. build\\n2. ship\\n## Pitfalls\\n- watch env"}',
    write: vi.fn(async () => ({ path: "/home/.vanta/skills/deploy-flow/SKILL.md" })),
    gate: (skill) => gateSkill(skill, new Set()),
    now,
    ...over,
  };
}

describe("runLearn", () => {
  it("fetches, distills, gates, and writes a skill (happy path)", async () => {
    const d = deps();
    const r = await runLearn("https://x.com/guide", undefined, d);
    expect(r.output).toContain('learned skill "deploy-flow"');
    expect(d.write).toHaveBeenCalledOnce();
  });

  it("honors a name override (slugified)", async () => {
    const write = vi.fn(async () => ({ path: "/p" }));
    await runLearn("https://x/guide", "My Cool Skill", deps({ write }));
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ name: "my-cool-skill" }));
  });

  it("reports a read failure without writing", async () => {
    const write = vi.fn(async () => ({ path: "/p" }));
    const r = await runLearn("https://x/404", undefined, deps({
      write,
      fetchText: async () => { throw new Error("HTTP 404"); },
    }));
    expect(r.output).toContain("could not read");
    expect(r.output).toContain("HTTP 404");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a thin/garbage draft at the gate, no write", async () => {
    const write = vi.fn(async () => ({ path: "/p" }));
    const r = await runLearn("https://x/guide", undefined, deps({
      write,
      distill: async () => '{"name":"x","description":"d","body":"tiny"}',
    }));
    expect(r.output).toContain("rejected the draft");
    expect(write).not.toHaveBeenCalled();
  });

  it("reports when the distiller returns no valid draft", async () => {
    const r = await runLearn("https://x/guide", undefined, deps({ distill: async () => "sorry, no idea" }));
    expect(r.output).toContain("could not distill");
  });
});
