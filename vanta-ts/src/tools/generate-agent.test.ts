import { describe, it, expect } from "vitest";
import { generateAgentTool, runGenerateAgent, type AgentFs } from "./generate-agent.js";
import type { ToolContext } from "./types.js";

const VALID = JSON.stringify({
  identifier: "pr-reviewer",
  whenToUse: "Use when a pull request needs a structured review.",
  systemPrompt: "You are a meticulous PR reviewer.",
});

function fakeFs(): { fs: AgentFs; writes: Array<{ path: string; content: string }>; mkdirs: string[] } {
  const writes: Array<{ path: string; content: string }> = [];
  const mkdirs: string[] = [];
  return {
    writes,
    mkdirs,
    fs: {
      mkdir: async (dir) => {
        mkdirs.push(dir);
      },
      writeFile: async (path, content) => {
        writes.push({ path, content });
      },
    },
  };
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root: "/tmp/root",
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...overrides,
  };
}

describe("runGenerateAgent", () => {
  it("generates, parses, and writes the agent file (injected generator + fs, no LLM)", async () => {
    const { fs, writes, mkdirs } = fakeFs();
    let promptSeen = "";
    const res = await runGenerateAgent(
      { description: "review PRs", repoContext: "rust + ts" },
      {
        generate: async (prompt) => {
          promptSeen = prompt;
          return VALID;
        },
        fs,
        filePath: (id) => `/fake/home/agents/${id}.md`,
      },
    );

    expect(res.ok).toBe(true);
    expect(res.output).toContain("pr-reviewer");
    expect(res.output).toContain("when to use:");
    // the generator was asked with a prompt carrying description + context
    expect(promptSeen).toContain("review PRs");
    expect(promptSeen).toContain("rust + ts");
    // it created the agents dir and wrote the rendered file there
    expect(mkdirs).toContain("/fake/home/agents");
    expect(writes).toHaveLength(1);
    const write = writes[0];
    if (!write) throw new Error("expected one write");
    expect(write.path).toBe("/fake/home/agents/pr-reviewer.md");
    expect(write.content).toContain("name: pr-reviewer");
    expect(write.content).toContain("You are a meticulous PR reviewer.");
  });

  it("errors-as-values on malformed model output (writes nothing)", async () => {
    const { fs, writes } = fakeFs();
    const res = await runGenerateAgent(
      { description: "x", repoContext: "" },
      { generate: async () => "sorry, no JSON here", fs, filePath: (id) => `/fake/${id}.md` },
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("could not parse generated agent");
    expect(writes).toHaveLength(0);
  });

  it("errors-as-values when the generator throws (no LLM reachable)", async () => {
    const { fs, writes } = fakeFs();
    const res = await runGenerateAgent(
      { description: "x", repoContext: "" },
      {
        generate: async () => {
          throw new Error("provider down");
        },
        fs,
      },
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("agent generation failed");
    expect(res.output).toContain("provider down");
    expect(writes).toHaveLength(0);
  });

  it("errors-as-values when the file write fails", async () => {
    const failingFs: AgentFs = {
      mkdir: async () => undefined,
      writeFile: async () => {
        throw new Error("disk full");
      },
    };
    const res = await runGenerateAgent(
      { description: "x", repoContext: "" },
      { generate: async () => VALID, fs: failingFs, filePath: (id) => `/fake/${id}.md` },
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("could not write agent file");
    expect(res.output).toContain("disk full");
  });
});

describe("generateAgentTool", () => {
  it("describeForSafety surfaces the write op (not the description) for the kernel", () => {
    expect(generateAgentTool.describeForSafety?.({ description: "secret plan" })).toBe(
      "write a generated agent definition file",
    );
    expect(generateAgentTool.describeForSafety?.({ description: "secret plan" })).not.toContain("secret");
  });

  it("errors-as-values on a missing description (never throws)", async () => {
    const res = await generateAgentTool.execute({}, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("description");
  });

  it("declines without writing when the human denies approval", async () => {
    const res = await generateAgentTool.execute(
      { description: "review PRs" },
      ctx({ requestApproval: async () => false }),
    );
    expect(res.ok).toBe(false);
    expect(res.output).toContain("declined");
  });
});
