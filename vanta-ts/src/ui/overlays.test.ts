import { describe, it, expect } from "vitest";
import { sessionRows, skillRows, modelRows, providerModelRows, setupRows, PICKER_KINDS } from "./overlays.js";
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
    const rows = modelRows("openai", "gpt-5");
    const openai = rows.find((r) => r.command === "/model openai");
    expect(openai).toBeTruthy();
    expect(openai!.mark).toBe("●"); // current marker, its own column
    expect(openai!.next).toEqual({ kind: "modelProvider", providerId: "openai" });
    const other = rows.find((r) => r.command !== "/model openai");
    expect(other!.mark).toBeUndefined(); // non-current rows carry no mark
    expect(rows.at(-1)).toMatchObject({ label: "Set current as default", command: "/model --global openai gpt-5" });
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

  it("PICKER_KINDS maps bare commands to overlay kinds", () => {
    expect(PICKER_KINDS.setup).toBe("setup");
    expect(PICKER_KINDS.model).toBe("model");
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
