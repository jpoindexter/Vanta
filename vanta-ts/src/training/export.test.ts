import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Session } from "../sessions/store.js";
import { exportTrajectoryBatch, trainTrajectorySft } from "./export.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

const session: Session = {
  id: "s1", title: "task", started: "2026-01-01", updated: "2026-01-01",
  messages: [{ role: "user", content: "Build it" }, { role: "assistant", content: "Built." }],
};

describe("trajectory export", () => {
  it("writes private trajectory, SFT, and manifest artifacts", async () => {
    const out = await mkdtemp(join(tmpdir(), "vanta-trajectory-")); dirs.push(out);
    const result = await exportTrajectoryBatch([session], out, 10);
    expect(JSON.parse((await readFile(result.trajectoriesPath, "utf8")).trim()).schema).toBe("vanta.trajectory.v1");
    expect(JSON.parse((await readFile(result.loraPath, "utf8")).trim())).toMatchObject({ prompt: "<user>Build it</user>", chosen: expect.stringContaining("Built.") });
    expect((await stat(result.loraPath)).mode & 0o777).toBe(0o600);
  });

  it("feeds exported SFT rows to the existing LoRA runner", async () => {
    const out = await mkdtemp(join(tmpdir(), "vanta-trajectory-train-")); dirs.push(out);
    const exported = await exportTrajectoryBatch([session], out, 10);
    let pairs = 0;
    const result = await trainTrajectorySft(exported.loraPath, { train: (deps) => {
      pairs = deps.pairs.length;
      return { ok: false, reason: "proof seam", readiness: { ready: true, usablePairs: pairs, reason: "ready" } };
    } });
    expect(pairs).toBe(1);
    expect(result.ok).toBe(false);
  });

  it("makes generated adapter artifacts private after a successful train", async () => {
    const out = await mkdtemp(join(tmpdir(), "vanta-trajectory-private-")); dirs.push(out);
    const exported = await exportTrajectoryBatch([session], out, 10);
    const adapter = join(out, "adapter");
    await mkdir(adapter);
    await writeFile(join(adapter, "adapter_config.json"), "{}", { mode: 0o644 });
    await trainTrajectorySft(exported.loraPath, {
      outputDir: adapter,
      train: () => ({
        ok: true,
        readiness: { ready: true, usablePairs: 1, reason: "ready" },
        result: { ok: true, device: "mps", examples: 1, trainableLoraParams: 1, lossFirst: 1, lossLast: 1, lossDecreased: true, adapterSaved: true, adapterDir: adapter },
      }),
    });
    expect((await stat(adapter)).mode & 0o777).toBe(0o700);
    expect((await stat(join(adapter, "adapter_config.json"))).mode & 0o777).toBe(0o600);
  });
});
