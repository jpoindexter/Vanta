import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tickets } from "./tickets-cmd.js";
import type { ReplCtx } from "./types.js";
import { createTicket, setStatus, type TicketDeps } from "../tickets/store.js";

let dataDir: string;
const deps: TicketDeps = { now: () => new Date(1000), id: (() => { let n = 0; return () => `t-${++n}`; })() };

function ctxFor(dir: string): ReplCtx {
  return { dataDir: dir } as unknown as ReplCtx;
}

beforeEach(async () => {
  dataDir = join(await mkdtemp(join(tmpdir(), "vanta-tickets-cmd-")), ".vanta");
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("/tickets handler", () => {
  it("returns guidance when there are no tickets", async () => {
    const res = await tickets("", ctxFor(dataDir));
    expect(res.output).toContain("No tickets yet.");
    expect(res.output).toContain("ticket tool");
  });

  it("prints a header summary and the board grouped by status", async () => {
    await createTicket(dataDir, { title: "Open issue" }, deps);
    const wip = await createTicket(dataDir, { title: "In flight" }, deps);
    await setStatus(dataDir, wip.id, "in_progress", deps);

    const res = await tickets("", ctxFor(dataDir));
    expect(res.output).toContain("2 ticket(s) · 2 active · 2 unread");
    expect(res.output).toContain("Open (1)");
    expect(res.output).toContain("In Progress (1)");
    expect(res.output).toContain("Open issue");
  });
});
