import { describe, it, expect } from "vitest";
import { explain } from "./capability-cmd.js";
import type { Message } from "../types.js";
import type { ReplCtx } from "./types.js";

function makeCtx(over: Partial<ReplCtx> = {}): ReplCtx {
  return {
    convo: { messages: [] as Message[] },
    dataDir: "/nonexistent-repo/.vanta",
    env: {},
    ...over,
  } as unknown as ReplCtx;
}

describe("explain handler", () => {
  it("reports suppressed state with --off when the env flag is unset", async () => {
    const result = await explain("off", makeCtx());
    expect(result.output).toMatch(/off/i);
    expect(result.output).toContain("VANTA_CAPABILITY_PRESERVE");
  });

  it("stays usable on demand even when the env flag is unset (default arg)", async () => {
    // dataDir points at a nonexistent repo → git fails → empty change set, but the
    // command must NOT short-circuit on the env flag (it's an explicit in-the-loop ask).
    const result = await explain("", makeCtx());
    expect(result.output).toMatch(/no uncommitted changes/i);
  });

  it("respects the env flag being on", async () => {
    const result = await explain("", makeCtx({ env: { VANTA_CAPABILITY_PRESERVE: "1" } }));
    expect(result.output).toMatch(/no uncommitted changes/i);
  });
});
