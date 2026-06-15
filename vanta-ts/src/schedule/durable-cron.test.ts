import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addDurableCron, loadDurableCron } from "./durable-cron.js";
import { loadCron } from "./cron.js";
import { cronCreateTool, cronListTool } from "../tools/cron.js";
import type { ToolContext } from "../tools/types.js";

let dataDir: string;
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-durable-cron-"));
  dataDir = join(root, ".vanta");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function ctx(): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
  };
}

describe("durable cron", () => {
  it("persists durable tasks to scheduled_tasks.json", async () => {
    const entry = await addDurableCron(dataDir, "0 8 * * *", "daily brief", true);
    const raw = JSON.parse(await readFile(join(dataDir, "scheduled_tasks.json"), "utf8"));

    expect(entry.durable).toBe(true);
    expect(entry.recurring).toBe(true);
    expect(raw.tasks[0].instruction).toBe("daily brief");
  });

  it("loads durable tasks alongside legacy cron.tsv tasks", async () => {
    await addDurableCron(dataDir, "0 8 * * *", "daily brief", false);

    const loaded = await loadCron(dataDir);

    expect(loaded[0]).toMatchObject({ instruction: "daily brief", durable: true, recurring: false });
  });

  it("cron_create durable=true writes JSON and cron_list shows the task", async () => {
    const created = await cronCreateTool.execute(
      { cron: "*/5 * * * *", instruction: "check inbox", durable: true, recurring: false },
      ctx(),
    );
    const listed = await cronListTool.execute({}, ctx());
    const durable = await loadDurableCron(dataDir);

    expect(created.output).toContain("durable");
    expect(durable[0]?.recurring).toBe(false);
    expect(listed.output).toContain("check inbox");
  });
});
