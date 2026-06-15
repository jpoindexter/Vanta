import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import { appendPreferenceSignal, signalFromApprovalDecision } from "../preferences/signals.js";
import type { ReplCtx } from "./types.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-preferences-cmd-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function ctx(): ReplCtx {
  return { env: { ...process.env, VANTA_HOME: home } } as unknown as ReplCtx;
}

describe("/preferences", () => {
  it("exports the JSONL path and content", async () => {
    await appendPreferenceSignal(signalFromApprovalDecision({ approved: true, action: "read README.md", reason: "kernel", toolName: "read_file" }), ctx().env);
    const result = await HANDLERS.preferences!("export", ctx());
    expect(result.output).toContain("preferences.jsonl");
    expect(result.output).toContain("\"kind\":\"approval_decision\"");
  });

  it("shows usage for unknown args", async () => {
    const result = await HANDLERS.preferences!("nope", ctx());
    expect(result.output).toContain("usage");
  });
});
