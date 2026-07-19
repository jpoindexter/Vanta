import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { roadmapAddTool } from "./roadmap-add.js";
import { roadmapMoveTool } from "./roadmap-move.js";
import { roadmapStatusTool } from "./roadmap-status.js";
import type { ToolContext } from "./types.js";

let root = "";

async function workspace(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), "vanta-roadmap-tool-"));
  await writeFile(join(root, "roadmap.json"), JSON.stringify({
    updated: "2026-07-10",
    items: [{ id: "EXISTING", track: "Core", title: "Existing", status: "next", size: "S", summary: "", done: "" }],
  }, null, 2), "utf8");
  return root;
}

function ctx(): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("roadmap_add tool", () => {
  it("keeps parked additions valid by defaulting parkedReason", async () => {
    await workspace();
    const res = await roadmapAddTool.execute({ id: "PARKED", title: "Parked", status: "parked" }, ctx());
    expect(res.ok).toBe(true);
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(data.items.find((i: { id: string }) => i.id === "PARKED").parkedReason).toBe("review");
  });

  it("accepts an explicit parkedReason", async () => {
    await workspace();
    const res = await roadmapAddTool.execute({
      id: "PROOF",
      title: "Proof",
      status: "parked",
      parkedReason: "external proof",
    }, ctx());
    expect(res.ok).toBe(true);
    const data = JSON.parse(await readFile(join(root, "roadmap.json"), "utf8"));
    expect(data.items.find((i: { id: string }) => i.id === "PROOF").parkedReason).toBe("external proof");
  });
});

describe("roadmap_move tool", () => {
  it("advertises every roadmap status", () => {
    const parameters = roadmapMoveTool.schema.parameters as {
      properties: { status: { enum: string[] } };
    };
    const status = parameters.properties.status;
    expect(status.enum).toEqual(["shipped", "building", "blocked", "next", "horizon", "parked"]);
  });
});

describe("roadmap_status tool", () => {
  it("reports roadmap work rather than the unrelated active-goal ledger", async () => {
    await workspace();
    const res = await roadmapStatusTool.execute({}, ctx());
    expect(res).toMatchObject({ ok: true });
    expect(res.output).toContain("total: 1");
    expect(res.output).toContain("actionable open roadmap work: 1");
    expect(res.output).toContain("EXISTING (next)");
  });

  it("can return only actionable roadmap cards", async () => {
    await workspace();
    const res = await roadmapStatusTool.execute({ view: "actionable" }, ctx());
    expect(res).toMatchObject({ ok: true });
    expect(res.output).toContain("EXISTING (next)");
  });
});
