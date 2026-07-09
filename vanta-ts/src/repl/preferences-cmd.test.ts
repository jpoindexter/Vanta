import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDLERS } from "./handlers.js";
import { appendPreferenceSignal, signalFromApprovalDecision } from "../preferences/signals.js";
import { loadBeliefStore } from "../operator-profile/beliefs.js";
import type { ReplCtx } from "./types.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-preferences-cmd-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function ctx(): ReplCtx {
  return {
    env: { ...process.env, VANTA_HOME: home },
    state: { sessionId: "session-one", started: "", turnIndex: 1 },
    now: () => new Date("2026-07-10T14:00:00.000Z"),
  } as unknown as ReplCtx;
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

  it("adds and lists an accepted belief with command provenance", async () => {
    const added = await HANDLERS.preferences!("add Keep status updates concise", ctx());
    expect(added.output).toContain("accepted belief");
    const listed = await HANDLERS.preferences!("", ctx());
    expect(listed.output).toContain("Keep status updates concise");
    expect(listed.output).toContain("self_report:session:session-one:command");
  });

  it("corrects a belief while preserving the superseded claim", async () => {
    await HANDLERS.preferences!("add I prefer detailed answers", ctx());
    const original = (await loadBeliefStore(ctx().env)).beliefs[0]!;
    const result = await HANDLERS.preferences!(`correct ${original.id} I prefer concise answers`, ctx());
    expect(result.output).toContain("corrected");
    const store = await loadBeliefStore(ctx().env);
    expect(store.beliefs.find((belief) => belief.id === original.id)?.status).toBe("superseded");
    expect(store.beliefs.find((belief) => belief.revisionOf === original.id)?.statement).toBe("I prefer concise answers");
  });

  it("rejects a belief and reports unknown ids without writing", async () => {
    await HANDLERS.preferences!("add Give me one choice at a time", ctx());
    const id = (await loadBeliefStore(ctx().env)).beliefs[0]!.id;
    expect((await HANDLERS.preferences!(`reject ${id}`, ctx())).output).toContain("rejected");
    expect((await HANDLERS.preferences!("reject missing", ctx())).output).toContain("not found");
    expect((await loadBeliefStore(ctx().env)).beliefs[0]?.status).toBe("rejected");
  });
});
