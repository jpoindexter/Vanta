import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTicket,
  addComment,
  addAttachment,
  setInbox,
  setStatus,
  linkTicket,
  listTickets,
  getTicket,
  formatTicketBoard,
  ticketsPath,
  type TicketDeps,
  type Ticket,
} from "./store.js";

let dir: string;

// Deterministic deps: a fixed clock + an incrementing id counter.
function makeDeps(start = 0): TicketDeps {
  let n = start;
  let ms = 1_000;
  return {
    now: () => new Date((ms += 1_000)),
    id: () => `t-${++n}`,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-tickets-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("tickets store", () => {
  it("creates a ticket with sane defaults", async () => {
    const t = await createTicket(dir, { title: "Login is broken" }, makeDeps());
    expect(t.id).toBe("t-1");
    expect(t.title).toBe("Login is broken");
    expect(t.status).toBe("open");
    expect(t.inbox).toBe("unread");
    expect(t.links).toEqual({});
    expect(t.labels).toEqual([]);
    expect(t.comments).toEqual([]);
    expect(t.attachments).toEqual([]);
    expect(t.createdAt).toBe(t.updatedAt);
    expect(await listTickets(dir)).toHaveLength(1);
  });

  it("honors explicit status, links, and labels on create", async () => {
    const t = await createTicket(
      dir,
      { title: "Spike", status: "in_progress", links: { goalId: "g1" }, labels: ["bug", "p1"] },
      makeDeps(),
    );
    expect(t.status).toBe("in_progress");
    expect(t.links.goalId).toBe("g1");
    expect(t.labels).toEqual(["bug", "p1"]);
  });

  it("adds comments in order and stamps updatedAt", async () => {
    const deps = makeDeps();
    const created = await createTicket(dir, { title: "Issue" }, deps);
    const a = await addComment(dir, created.id, "first note", deps);
    const b = await addComment(dir, created.id, "second note", deps);
    expect(b?.comments.map((c) => c.text)).toEqual(["first note", "second note"]);
    expect(b!.comments[0]!.at).not.toBe(b!.comments[1]!.at);
    expect(a?.updatedAt).not.toBe(created.createdAt);
  });

  it("adds attachments", async () => {
    const deps = makeDeps();
    const t = await createTicket(dir, { title: "Issue" }, deps);
    const updated = await addAttachment(dir, t.id, { name: "log.txt", path: "/tmp/log.txt" }, deps);
    expect(updated?.attachments).toEqual([{ name: "log.txt", path: "/tmp/log.txt" }]);
  });
});

describe("tickets store — state & links", () => {
  it("moves inbox state unread -> read -> archived", async () => {
    const deps = makeDeps();
    const t = await createTicket(dir, { title: "Issue" }, deps);
    expect(t.inbox).toBe("unread");
    expect((await setInbox(dir, t.id, "read", deps))?.inbox).toBe("read");
    expect((await setInbox(dir, t.id, "archived", deps))?.inbox).toBe("archived");
    expect((await getTicket(dir, t.id))?.inbox).toBe("archived");
  });

  it("changes status", async () => {
    const deps = makeDeps();
    const t = await createTicket(dir, { title: "Issue" }, deps);
    expect((await setStatus(dir, t.id, "done", deps))?.status).toBe("done");
  });

  it("links a ticket to a goal and a parent ticket", async () => {
    const deps = makeDeps();
    const parent = await createTicket(dir, { title: "Epic" }, deps);
    const child = await createTicket(dir, { title: "Subtask" }, deps);
    await linkTicket(dir, child.id, { kind: "goal", targetId: "g42" }, deps);
    const linked = await linkTicket(dir, child.id, { kind: "parent", targetId: parent.id }, deps);
    expect(linked?.links.goalId).toBe("g42");
    expect(linked?.links.parentId).toBe(parent.id);
    const withProject = await linkTicket(dir, child.id, { kind: "project", targetId: "indx" }, deps);
    expect(withProject?.links.projectId).toBe("indx");
  });

  it("returns undefined when mutating a missing ticket", async () => {
    const deps = makeDeps();
    expect(await addComment(dir, "nope", "x", deps)).toBeUndefined();
    expect(await setInbox(dir, "nope", "read", deps)).toBeUndefined();
    expect(await linkTicket(dir, "nope", { kind: "goal", targetId: "g1" }, deps)).toBeUndefined();
    expect(await getTicket(dir, "nope")).toBeUndefined();
  });

  it("getTicket finds by id", async () => {
    const deps = makeDeps();
    await createTicket(dir, { title: "A" }, deps);
    const b = await createTicket(dir, { title: "B" }, deps);
    expect((await getTicket(dir, b.id))?.title).toBe("B");
  });
});

describe("formatTicketBoard", () => {
  it("reports empty board", () => {
    expect(formatTicketBoard([])).toBe("No tickets yet.");
  });

  it("groups by status and shows links + inbox glyphs + counts", async () => {
    const deps = makeDeps();
    const open = await createTicket(dir, { title: "Open one", labels: ["ui"] }, deps);
    await linkTicket(dir, open.id, { kind: "goal", targetId: "g1" }, deps);
    await addComment(dir, open.id, "hmm", deps);
    const wip = await createTicket(dir, { title: "Working" }, deps);
    await setStatus(dir, wip.id, "in_progress", deps);
    await setInbox(dir, wip.id, "read", deps);
    const closed = await createTicket(dir, { title: "Old" }, deps);
    await setStatus(dir, closed.id, "closed", deps);

    const board = formatTicketBoard(await listTickets(dir));
    expect(board).toContain("Open (1)");
    expect(board).toContain("In Progress (1)");
    expect(board).toContain("Closed (1)");
    expect(board).not.toContain("Done (");
    // links + inbox glyph + comment count render on the row
    expect(board).toContain("goal:g1");
    expect(board).toContain("● t-1 — Open one");
    expect(board).toContain("○ t-2 — Working");
    expect(board).toContain("💬1");
  });
});

describe("tolerant reader", () => {
  it("skips a malformed row but keeps the valid ones", async () => {
    const good: Ticket = {
      id: "t-1",
      title: "Valid",
      status: "open",
      inbox: "unread",
      links: {},
      labels: [],
      comments: [],
      attachments: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await mkdir(dir, { recursive: true });
    // second row is missing required fields → must be dropped, not throw
    await writeFile(
      ticketsPath(dir),
      JSON.stringify({ version: 1, tickets: [good, { id: "t-2" }] }),
      "utf8",
    );
    const all = await listTickets(dir);
    expect(all.map((t) => t.id)).toEqual(["t-1"]);
  });

  it("degrades a corrupt file to an empty board", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(ticketsPath(dir), "{ this is not json", "utf8");
    expect(await listTickets(dir)).toEqual([]);
  });

  it("treats a non-array tickets field as empty", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(ticketsPath(dir), JSON.stringify({ version: 1, tickets: "oops" }), "utf8");
    expect(await listTickets(dir)).toEqual([]);
  });

  it("persists a clean envelope on write", async () => {
    const deps = makeDeps();
    await createTicket(dir, { title: "X" }, deps);
    const onDisk = JSON.parse(await readFile(ticketsPath(dir), "utf8"));
    expect(onDisk.version).toBe(1);
    expect(Array.isArray(onDisk.tickets)).toBe(true);
  });
});
