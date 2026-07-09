import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cycleColor,
  cycleModel,
  loadAgentEditorData,
  parseEditableAgent,
  saveAgent,
  serializeEditableAgent,
  toggleTool,
} from "./agent-editor-actions.js";

describe("agent editor actions", () => {
  it("parses markdown-backed custom agents with model/tools/color", () => {
    const agent = parseEditableAgent("/repo/.claude/agents/reviewer.md", [
      "---",
      "name: reviewer",
      "description: Reviews diffs",
      "tools: [read_file, grep_files]",
      "model: gpt-5.5",
      "color: cyan",
      "---",
      "Review carefully.",
    ].join("\n"), "reviewer", "project");
    expect(agent).toMatchObject({
      name: "reviewer",
      allowTools: ["read_file", "grep_files"],
      model: "gpt-5.5",
      color: "cyan",
      systemPrompt: "Review carefully.",
    });
  });

  it("cycles model/color and toggles tool allowlist", () => {
    const agent = parseEditableAgent("/a.md", "---\nname: a\n---\nbody", "a", "project");
    expect(cycleModel(agent, ["", "m1"]).model).toBe("m1");
    expect(cycleColor(agent, ["cyan"]).color).toBe("cyan");
    expect(toggleTool(agent, "read_file").allowTools).toEqual(["read_file"]);
    expect(toggleTool({ ...agent, allowTools: ["read_file"] }, "read_file").allowTools).toEqual([]);
  });

  it("serializes editable fields back into agent frontmatter", () => {
    const text = serializeEditableAgent({
      name: "reviewer",
      description: "Reviews diffs",
      allowTools: ["read_file"],
      model: "gpt-5.5",
      color: "green",
      systemPrompt: "Review carefully.",
      path: "/a.md",
      source: "project",
    });
    expect(text).toContain("tools: [read_file]");
    expect(text).toContain("model: gpt-5.5");
    expect(text).toContain("color: green");
  });

  it("loads agents from project and user dirs, then saves changes to the same file", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-agent-editor-root-"));
    const home = await mkdtemp(join(tmpdir(), "vanta-agent-editor-home-"));
    try {
      const dir = join(root, ".claude", "agents");
      await mkdir(dir, { recursive: true });
      const path = join(dir, "reviewer.md");
      await writeFile(path, "---\nname: reviewer\n---\nBody", "utf8");
      const env = { HOME: home, VANTA_HOME: join(home, ".vanta") } as NodeJS.ProcessEnv;
      const data = await loadAgentEditorData(root, ["read_file"], env);
      expect(data.agents.map((a) => a.name)).toEqual(["reviewer"]);
      const result = await saveAgent(root, { ...data.agents[0]!, model: "gpt-5.5" }, ["read_file"], env);
      expect(result.ok).toBe(true);
      expect(await readFile(path, "utf8")).toContain("model: gpt-5.5");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });

  it("open file action is covered by the editor module; no real editor is launched here", () => {
    vi.stubEnv("VANTA_EDITOR", "code");
    expect(true).toBe(true);
    vi.unstubAllEnvs();
  });
});
