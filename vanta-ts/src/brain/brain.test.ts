import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brainDigest, remember, recall, brainHealth } from "./brain.js";
import { loadEntries, entriesFile } from "./entries.js";
import { brainTool } from "../tools/brain.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-brainf-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

describe("brainDigest (the one composed digest)", () => {
  it("with no entries it is exactly the region layer — no structured section", async () => {
    const d = await brainDigest();
    expect(d).toContain("Identity & Personality"); // seeded md regions present
    expect(d).not.toContain("Structured recall");
  });

  it("includes the top structured memories once any exist", async () => {
    await remember({ region: "user_model", content: "jason ships in vertical slices" });
    const d = await brainDigest();
    expect(d).toContain("Structured recall");
    expect(d).toContain("jason ships in vertical slices");
    expect(d).toContain("Identity & Personality"); // both layers, one digest
  });

  it("a corrupt entry store degrades to the region layer instead of breaking", async () => {
    await mkdir(join(home, "brain"), { recursive: true });
    await writeFile(entriesFile(), "NOT JSON", "utf8");
    const d = await brainDigest();
    expect(d).toContain("Identity & Personality");
    expect(d).not.toContain("Structured recall");
  });

  it("sweeps decayed entries out of the digest", async () => {
    await remember({ region: "mood", content: "fleeting", forgetAfter: "2000-01-01T00:00:00Z" });
    const d = await brainDigest();
    expect(d).not.toContain("fleeting");
    expect(await loadEntries()).toHaveLength(0); // lazily swept
  });
});

describe("remember + recall (retrieval reinforces)", () => {
  it("round-trips and strengthens on recall", async () => {
    await remember({ region: "semantic", content: "the kernel gates every tool call" });
    const r = await recall({ query: "kernel" });
    expect(r.entries).toHaveLength(1);
    expect(r.formatted).toContain("kernel gates");
    const [e] = await loadEntries();
    expect(e?.retrievalCount).toBe(1); // recall reinforced it
    expect(e?.strength).toBeCloseTo(0.55);
  });

  it("reinforce:false peeks without strengthening", async () => {
    await remember({ region: "semantic", content: "quiet fact" });
    await recall({ query: "quiet", reinforce: false });
    expect((await loadEntries())[0]?.retrievalCount).toBe(0);
  });
});

describe("brainHealth (self-check before self-repair)", () => {
  it("reports both layers healthy after first use", async () => {
    await brainDigest(); // seeds regions
    await remember({ region: "semantic", content: "x" });
    const h = await brainHealth();
    expect(h.ok).toBe(true);
    expect(h.regionsMissing).toEqual([]);
    expect(h.regionsPresent).toBeGreaterThanOrEqual(9);
    expect(h.entryCount).toBe(1);
    expect(h.decayedCount).toBe(0);
  });
});

describe("brain tool (the agent-facing surface)", () => {
  it("remember + recall actions work end-to-end", async () => {
    const w = await brainTool.execute(
      { action: "remember", region: "user_model", content: "prefers options objects", entry_type: "preference", strength: 0.8 },
      {} as never,
    );
    expect(w.ok).toBe(true);
    expect(w.output).toContain("remembered [user_model|preference|str:0.80]");

    const r = await brainTool.execute({ action: "recall", query: "options objects" }, {} as never);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("prefers options objects");
  });

  it("recall with no matches says so", async () => {
    const r = await brainTool.execute({ action: "recall", query: "nothing-here" }, {} as never);
    expect(r.ok).toBe(true);
    expect(r.output).toBe("(no matching memories)");
  });

  it("remember validates the region", async () => {
    const r = await brainTool.execute({ action: "remember", region: "nope", content: "x" }, {} as never);
    expect(r.ok).toBe(false);
  });

  it("legacy region actions are unchanged (read/list)", async () => {
    const list = await brainTool.execute({ action: "list" }, {} as never);
    expect(list.ok).toBe(true);
    expect(list.output).toContain("identity —");
    await brainTool.execute({ action: "append", region: "semantic", content: "appended fact" }, {} as never);
    const read = await brainTool.execute({ action: "read", region: "semantic" }, {} as never);
    expect(read.ok).toBe(true);
    expect(read.output).toContain("appended fact");
  });
});
