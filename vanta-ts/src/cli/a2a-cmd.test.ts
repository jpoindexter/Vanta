import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runA2aCommand } from "./a2a-cmd.js";
import type { ExecProbe } from "../agents/autonomous-preflight.js";

const probe = (results: Record<string, { ok: boolean; stdout: string }>): ExecProbe =>
  (cmd, args) => results[`${cmd} ${args[0]}`] ?? { ok: false, stdout: "" };

const noAuth = () => null;

describe("runA2aCommand", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints JSON readiness and exits nonzero until proof is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-a2a-"));
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = runA2aCommand(root, ["autonomous-status", "--json"], {}, { readAuth: noAuth, probe: probe({ "docker version": { ok: false, stdout: "" } }) });
    const out = JSON.parse(lines.join("\n")) as { ready: boolean; receiptPath: string; gates: Array<{ id: string; ready: boolean }> };
    expect(code).toBe(1);
    expect(out.ready).toBe(false);
    expect(out.receiptPath).toBe(".vanta/a2a-autonomous-sandbox.json");
    expect(out.gates.map((g) => g.id)).toEqual(["docker", "image", "credential", "proof"]);
  });

  it("accepts a persisted npm-driven Docker receipt as the proof gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-a2a-"));
    await mkdir(join(root, ".vanta"));
    await writeFile(
      join(root, ".vanta/a2a-autonomous-sandbox.json"),
      JSON.stringify({ provedAt: "2026-07-10T00:00:00.000Z", container: "docker", npmDriven: true }),
    );
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line = "") => lines.push(String(line)));
    const code = runA2aCommand(root, ["autonomous-status"], {}, { readAuth: noAuth, probe: probe({ "docker version": { ok: false, stdout: "" } }) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("proof: ready");
    expect(lines.join("\n")).toContain("docker: missing");
  });
});
