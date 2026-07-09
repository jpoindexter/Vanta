import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import type { ReplCtx } from "./types.js";

function ctx(home: string): ReplCtx {
  return {
    convo: { messages: [], send: async () => ({ finalText: "", iterations: 0, stoppedReason: "done", toolIterations: 0 }), setProvider: () => {}, setSessionMemory: () => {} },
    setup: { safety: { getGoals: async () => [] }, registry: { schemas: () => [] }, provider: { modelId: () => "m", contextWindow: () => 1000 } },
    dataDir: join(home, "data"),
    state: { sessionId: "s1", started: new Date(0).toISOString(), turnIndex: 0 },
    env: { VANTA_HOME: home },
    now: () => new Date(0),
  } as unknown as ReplCtx;
}

describe("/memory", () => {
  it("saves to semantic brain and reports the file/change type", async () => {
    const home = await mkdtemp(join(tmpdir(), "vanta-memory-cmd-"));
    const result = await HANDLERS.memory!("prefers focused roadmap pushes", ctx(home));

    expect(result.output).toContain("memory saved · semantic.md · appended");
    expect(result.output).toContain(join(home, "brain", "semantic.md"));
    expect(await readFile(join(home, "brain", "semantic.md"), "utf8")).toContain("- prefers focused roadmap pushes");
  });
});
