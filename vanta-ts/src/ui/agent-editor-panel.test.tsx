import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentEditorPanel } from "./agent-editor-panel.js";
import { loadAgentEditorData } from "./agent-editor-actions.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";

describe("AgentEditorPanel", () => {
  it("opens a custom agent and persists model/tool edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-agent-editor-panel-"));
    const home = await mkdtemp(join(tmpdir(), "vanta-agent-editor-panel-home-"));
    const oldHome = process.env.HOME;
    const oldVanta = process.env.VANTA_HOME;
    try {
      const dir = join(root, ".claude", "agents");
      await mkdir(dir, { recursive: true });
      const path = join(dir, "reviewer.md");
      await writeFile(path, "---\nname: reviewer\ndescription: Reviews diffs\n---\nReview carefully.", "utf8");
      process.env.HOME = home;
      process.env.VANTA_HOME = join(home, ".vanta");
      const data = await loadAgentEditorData(root, ["read_file", "shell_cmd"], process.env);
      const inst = renderUi(h(AgentEditorPanel, { repoRoot: root, data, onClose: () => {} }));
      await waitForFrame(inst, "custom agent editor");
      inst.input("\r");
      await waitForFrame(inst, "Agent editor");
      inst.input("\r"); // model row cycles from inherit to first catalog choice.
      await waitUntil(() => /model: /.test(readFileSync(path, "utf8")));
      inst.input("\x1b[B");
      await tick();
      inst.input("\x1b[B");
      await tick();
      inst.input("\r"); // first tool row
      await waitUntil(() => readFileSync(path, "utf8").includes("tools: [read_file]"));
      const saved = await readFile(path, "utf8");
      expect(saved).toContain("tools: [read_file]");
      inst.unmount();
    } finally {
      if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
      if (oldVanta === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = oldVanta;
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
