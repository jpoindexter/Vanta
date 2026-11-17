import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dataDirFor } from "../cli/ops.js";
import { addCron } from "../schedule/cron.js";
import { handleDesktopSchedules } from "./schedule-api.js";

let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-desktop-schedules-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function response() {
  let status = 0;
  let body = "";
  return {
    res: { writeHead: (value: number) => { status = value; }, end: (value: string) => { body = value; } } as any,
    result: () => ({ status, body: JSON.parse(body) }),
  };
}

describe("desktop schedules API", () => {
  it("lists the same project-scoped schedule records used by the CLI", async () => {
    await addCron(dataDirFor(root), "0 9 * * 1-5", "check fresh job leads");
    const reply = response();

    await handleDesktopSchedules({ root }, reply.res);

    expect(reply.result()).toEqual({
      status: 200,
      body: [{ id: 1, cron: "0 9 * * 1-5", instruction: "check fresh job leads", status: "active" }],
    });
  });
});
