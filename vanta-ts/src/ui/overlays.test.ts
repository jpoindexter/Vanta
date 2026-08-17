import { describe, it, expect } from "vitest";
import { effortRows, modelRows, modelSettingsRows, providerModelRows, sessionRows, setupRows, skillRows, speedRows, PICKER_KINDS } from "./overlays.js";
import type { SessionMeta } from "../sessions/store.js";
import type { Skill } from "../skills/types.js";

describe("overlay row builders", () => {
  it("sessionRows carries a /resume command per session", () => {
    const ss: SessionMeta[] = [{ id: "20260613-1", turns: 3, title: "wiring" } as SessionMeta];
    const rows = sessionRows(ss);
    expect(rows[0]!.command).toBe("/resume 20260613-1");
    expect(rows[0]!.label).toContain("3 turn(s)");
    expect(rows[0]!.hint).toBe("wiring");
  });

  it("skillRows carries a /<name> command", () => {
    const sk = [{ meta: { name: "hill-climb", description: "iterate" } } as Skill];
    expect(skillRows(sk)[0]!.command).toBe("/hill-climb");
  });

  it("modelRows marks the current provider with ● and carries /model <id>", () => {
    const rows = modelRows("openai", "gpt-5", {});
    const openai = rows.find((r) => r.command === "/model openai");
    expect(openai).toBeTruthy();
    expect(openai!.mark).toBe("●"); // current marker, its own column
    expect(openai!.next).toEqual({ kind: "modelProvider", providerId: "openai" });
    const other = rows.find((r) => r.command !== "/model openai");
    expect(other!.mark).toBeUndefined(); // non-current rows carry no mark
    expect(rows.at(-1)).toMatchObject({ label: "Set current as default", command: "/model --global openai gpt-5" });
  });

  it("adds one capability-driven settings entry for the active Codex model", () => {
    const rows = modelRows("codex", "gpt-5.6-sol", { effortLevel: "ultra", speed: "fast" });
    expect(rows.find((row) => row.next?.kind === "modelSettings")).toMatchObject({
      label: "Model settings",
      hint: "effort ultra · speed fast",
    });
    expect(modelRows("ollama", "qwen", {}).some((row) => row.next?.kind === "modelSettings")).toBe(false);
  });

  it("builds effort and speed settings rows from the shared provider capabilities", () => {
    const settings = modelSettingsRows("codex", "gpt-5.6-sol", { effortLevel: "high", speed: "standard" }, {});
    expect(settings.map((row) => row.next?.kind)).toEqual(["modelProviders", "modelEffort", "modelSpeed", undefined]);
    expect(settings.at(-1)?.command).toBe("/model-settings --global");

    const effort = effortRows("codex", "gpt-5.6-sol", "ultra", {});
    expect(effort.find((row) => row.command === "/effort ultra --session")?.mark).toBe("●");
    expect(effort.every((row) => row.command === "/model-settings" || row.afterCommand?.kind === "modelSettings")).toBe(true);

    const speed = speedRows("codex", "gpt-5.6-sol", "fast", {});
    expect(speed.find((row) => row.command === "/speed fast --session")?.mark).toBe("●");
    expect(speed.some((row) => row.command === "/speed standard --session")).toBe(true);
    expect(speedRows("claude-code", "claude-sonnet-5", undefined, {})).toEqual([]);
    // Opus fast mode is real, and its hint carries Anthropic's own multiplier.
    const opus = speedRows("claude-code", "claude-opus-5", undefined, {});
    expect(opus.find((row) => row.command === "/speed fast --session")?.hint).toBe("up to 2.5× output speed, premium rate");
    expect(opus.find((row) => row.command === "/speed standard --session")?.mark).toBe("●");
  });

  it("providerModelRows exposes every discovered Ollama model through the existing hot-swap command", () => {
    const rows = providerModelRows("ollama", [
      "qwen2.5:14b",
      "hf.co/openbmb/MiniCPM5-1B-GGUF:q4_k_m",
    ], "ollama", "hf.co/openbmb/MiniCPM5-1B-GGUF:q4_k_m");
    expect(rows[0]).toMatchObject({ label: "Back to providers", next: { kind: "modelProviders" } });
    expect(rows.find((row) => row.command.includes("MiniCPM5"))).toMatchObject({
      mark: "●",
      command: "/model ollama hf.co/openbmb/MiniCPM5-1B-GGUF:q4_k_m",
    });
  });

  it("providerModelRows chains into settings for an effort-capable model, and applies-and-closes otherwise", () => {
    const rows = providerModelRows("anthropic", ["claude-opus-5", "claude-sonnet-5"], "anthropic", "claude-sonnet-5");
    const opus = rows.find((row) => row.command === "/model anthropic claude-opus-5");
    // Claude models expose effort → picking one drills into the settings menu.
    expect(opus).toMatchObject({ afterCommand: { kind: "modelSettings" } });

    const noEffort = providerModelRows("ollama", ["qwen2.5:14b"], "ollama");
    const qwen = noEffort.find((row) => row.command === "/model ollama qwen2.5:14b");
    // Ollama has no tunable controls → no dead-end settings hop.
    expect(qwen?.afterCommand).toBeUndefined();
  });

  it("PICKER_KINDS maps bare commands to overlay kinds", () => {
    expect(PICKER_KINDS.setup).toBe("setup");
    expect(PICKER_KINDS.model).toBe("model");
    expect(PICKER_KINDS.effort).toBe("modelSettings");
    expect(PICKER_KINDS.speed).toBe("modelSettings");
    expect(PICKER_KINDS["model-settings"]).toBe("modelSettings");
    expect(PICKER_KINDS.cockpit).toBe("cockpit");
    expect(PICKER_KINDS.stats).toBe("stats");
    expect(PICKER_KINDS.export).toBe("export");
    expect(PICKER_KINDS.memory).toBe("memory");
    expect(PICKER_KINDS.agents).toBe("agentEditor");
    expect(PICKER_KINDS["workflow-select"]).toBe("workflowSelect");
    expect(PICKER_KINDS["plugin-panels"]).toBe("pluginPanels");
    expect(PICKER_KINDS.nope).toBeUndefined();
  });

  it("setupRows exposes setup outcomes instead of aliasing the model picker", () => {
    expect(setupRows().map((row) => row.command)).toEqual([
      "/model",
      "/setup telegram",
      "/setup tts",
      "/mcp",
    ]);
  });
});
