import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySafetyGate } from "./dispatch-helpers.js";
import type { AgentDeps } from "../agent.js";
import type { ToolContext } from "../tools/types.js";
import type { ToolCall } from "../types.js";

// Integration test for the permissions gate in dispatch: the kernel verdict is
// the floor; rules may TIGHTEN it but never loosen a Block. (The tighten() truth
// table itself is exhaustively unit-tested in permissions/rules.test.ts.)

let home: string;
const savedHome = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-perm-gate-"));
  process.env.VANTA_HOME = home;
});
afterEach(async () => {
  if (savedHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = savedHome;
  await rm(home, { recursive: true, force: true });
});

async function writeRules(rows: string): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(join(home, "permissions.tsv"), rows, "utf8");
}

type GateOpts = { risk: "allow" | "ask" | "block"; approve?: boolean; onAsk?: () => void };
function makeDeps(o: GateOpts): AgentDeps {
  return {
    registry: { get: () => ({ describeForSafety: (a: { cmd?: string }) => `run ${a.cmd ?? "x"}` }) },
    safety: {
      assess: async () => ({ risk: o.risk, reason: "kernel" }),
      proposeApproval: async () => "id1",
      approve: async () => {},
      deny: async () => {},
    },
    requestApproval: async () => { o.onAsk?.(); return o.approve ?? true; },
    onToolResult: () => {},
  } as unknown as AgentDeps;
}

const call: ToolCall = { id: "1", name: "shell_cmd", arguments: { cmd: "ls" } };
const ctx = {} as ToolContext;

describe("applySafetyGate + permissions", () => {
  it("a deny rule blocks an otherwise-allowed tool", async () => {
    await writeRules("deny\tshell_cmd\t\n");
    const res = await applySafetyGate(call, makeDeps({ risk: "allow" }), ctx);
    expect(res.approved).toBe(false);
    expect(res.reason).toContain("permission rule");
  });

  it("CANNOT loosen a kernel Block, even with an allow rule", async () => {
    await writeRules("allow\tshell_cmd\t\n");
    const res = await applySafetyGate(call, makeDeps({ risk: "block" }), ctx);
    expect(res.approved).toBe(false); // block is immovable
  });

  it("an allow rule auto-confirms a kernel Ask without prompting", async () => {
    await writeRules("allow\tshell_cmd\t\n");
    let prompted = false;
    const res = await applySafetyGate(call, makeDeps({ risk: "ask", onAsk: () => { prompted = true; } }), ctx);
    expect(res.approved).toBe(true);
    expect(prompted).toBe(false); // skipped the approval prompt
  });

  it("no rules → behaves exactly as the kernel verdict (ask still prompts)", async () => {
    let prompted = false;
    const res = await applySafetyGate(call, makeDeps({ risk: "ask", approve: true, onAsk: () => { prompted = true; } }), ctx);
    expect(res.approved).toBe(true);
    expect(prompted).toBe(true);
  });

  it("kernel unreachable → fails CLOSED gracefully (blocked result, no throw)", async () => {
    const deps = makeDeps({ risk: "allow" });
    (deps.safety as unknown as { assess: () => Promise<never> }).assess = async () => {
      throw new Error("fetch failed");
    };
    const res = await applySafetyGate(call, deps, ctx);
    expect(res.approved).toBe(false);
    expect(res.reason).toContain("kernel unreachable");
    expect(res.reason).toContain("restart vanta");
  });

  it("a kernel hiccup during approval-queue bookkeeping does not abort an approved turn", async () => {
    const deps = makeDeps({ risk: "ask", approve: true });
    (deps.safety as unknown as { proposeApproval: () => Promise<never> }).proposeApproval = async () => {
      throw new Error("fetch failed");
    };
    const res = await applySafetyGate(call, deps, ctx);
    expect(res.approved).toBe(true); // bookkeeping is best-effort
  });
});
