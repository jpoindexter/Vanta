import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ticketTool } from "./tickets.js";
import type { ToolContext } from "./types.js";
import { listTickets } from "../tickets/store.js";

function makeCtx(root: string): ToolContext {
  return { root, safety: {} as never, requestApproval: async () => true };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ticket-tool-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ticket tool", () => {
  it("describeForSafety is a constant internal-op string (kernel Allow)", () => {
    expect(ticketTool.describeForSafety?.({ action: "create" })).toBe("manage internal issue tickets");
  });

  it("rejects an unparseable call as a value, not a throw", async () => {
    const res = await ticketTool.execute({ action: "bogus" }, makeCtx(root));
    expect(res.ok).toBe(false);
    expect(res.output).toContain("action");
  });

  it("creates, comments, attaches, links, and sets inbox through the tool", async () => {
    const ctx = makeCtx(root);
    const created = await ticketTool.execute({ action: "create", title: "Search 500s", labels: ["bug"] }, ctx);
    expect(created.ok).toBe(true);
    const id = (await listTickets(join(root, ".vanta")))[0]!.id;

    expect((await ticketTool.execute({ action: "comment", id, text: "repro found" }, ctx)).output).toContain("1 total");
    expect((await ticketTool.execute({ action: "attach", id, name: "stack.txt", path: "/tmp/s.txt" }, ctx)).ok).toBe(true);
    expect((await ticketTool.execute({ action: "link", id, link: "goal", target: "g9" }, ctx)).output).toContain("goal:g9");
    const inboxed = await ticketTool.execute({ action: "inbox", id, inbox: "read" }, ctx);
    expect(inboxed.output).toContain("inbox:read");

    const t = (await listTickets(join(root, ".vanta")))[0]!;
    expect(t.comments).toHaveLength(1);
    expect(t.attachments).toHaveLength(1);
    expect(t.links.goalId).toBe("g9");
    expect(t.inbox).toBe("read");
  });
});

describe("ticket tool — views & validation", () => {
  it("inbox action can set status alongside inbox", async () => {
    const ctx = makeCtx(root);
    await ticketTool.execute({ action: "create", title: "X" }, ctx);
    const id = (await listTickets(join(root, ".vanta")))[0]!.id;
    await ticketTool.execute({ action: "inbox", id, status: "in_progress", inbox: "read" }, ctx);
    const t = (await listTickets(join(root, ".vanta")))[0]!;
    expect(t.status).toBe("in_progress");
    expect(t.inbox).toBe("read");
  });

  it("board groups by status", async () => {
    const ctx = makeCtx(root);
    await ticketTool.execute({ action: "create", title: "Open issue" }, ctx);
    const second = await ticketTool.execute({ action: "create", title: "WIP issue" }, ctx);
    expect(second.ok).toBe(true);
    const id = (await listTickets(join(root, ".vanta")))[1]!.id;
    await ticketTool.execute({ action: "inbox", id, status: "in_progress" }, ctx);

    const board = await ticketTool.execute({ action: "board" }, ctx);
    expect(board.output).toContain("Open (1)");
    expect(board.output).toContain("In Progress (1)");
  });

  it("list returns a friendly empty message", async () => {
    expect((await ticketTool.execute({ action: "list" }, makeCtx(root))).output).toBe("No tickets yet.");
  });

  it("reports a missing ticket for mutate actions", async () => {
    const ctx = makeCtx(root);
    const res = await ticketTool.execute({ action: "comment", id: "ghost", text: "hi" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("ghost");
  });

  it("validates required fields per action", async () => {
    const ctx = makeCtx(root);
    expect((await ticketTool.execute({ action: "create" }, ctx)).output).toContain("title");
    expect((await ticketTool.execute({ action: "attach", id: "x" }, ctx)).output).toContain("name");
    expect((await ticketTool.execute({ action: "link", id: "x" }, ctx)).output).toContain("link");
  });
});
