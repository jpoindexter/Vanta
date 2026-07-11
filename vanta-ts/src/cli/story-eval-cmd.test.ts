import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStoryEvalCommand } from "./story-eval-cmd.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("vanta story-eval", () => {
  it("loads a scripted scenario and writes its multi-turn receipt", async () => {
    const root = join(tmpdir(), `vanta-story-eval-${Date.now()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    const manifest = join(root, "manifest.json");
    const receipt = join(root, "receipt.json");
    await writeFile(manifest, JSON.stringify({ scenarios: [{
      id: "story", category: "Dev Workflow", tier: "sandbox", instruction: "Clarify first",
      firstTurn: { boundary: "clarification", checks: ["?"] },
      operatorReplies: [{ reply: "Option one", boundary: "approval", checks: ["Approve"] }],
      expectedTools: ["clarify"], forbiddenPatterns: ["edit_file"],
    }] }));
    const lines: string[] = [];

    const code = await runStoryEvalCommand(root, ["--manifest", manifest, "--id", "story", "--out", receipt], {
      log: (line) => lines.push(line),
      run: async () => ({ id: "story", passed: true, turns: [
        { index: 0, input: "Clarify first", output: "Which?", boundary: "clarification", checks: ["?"], missing: [], boundaryPassed: true, guardPassed: true, forbiddenHits: [], tools: [{ name: "clarify", ok: true }], stoppedReason: "done", iterations: 1, toolIterations: 1, passed: true },
        { index: 1, input: "Option one", output: "Approve plan?", boundary: "approval", checks: ["Approve"], missing: [], boundaryPassed: true, guardPassed: true, forbiddenHits: [], tools: [], stoppedReason: "done", iterations: 1, toolIterations: 0, passed: true },
      ] }),
    });

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("story-eval PASS");
    const saved = JSON.parse(await readFile(receipt, "utf8"));
    expect(saved.results[0]).toMatchObject({ id: "story", reliable: true, surfacePassed: true, guardPassed: true });
    expect(saved.results[0].turns).toHaveLength(2);
  });
});
