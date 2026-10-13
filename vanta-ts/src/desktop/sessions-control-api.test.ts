import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSession, saveSession, setSessionArchived, setSessionTrashed } from "../sessions/store.js";
import type { Message } from "../types.js";
import { startControlHarness, type ControlHarness } from "./__fixtures__/control-harness.js";

let h: ControlHarness;
beforeEach(async () => { h = await startControlHarness(); });
afterEach(async () => { await h.stop(); });

const TRANSCRIPT: Message[] = [
  { role: "system", content: "You are Vanta." },
  { role: "user", content: "Plan the invoice reconciliation for October" },
  { role: "assistant", content: "I will start with the bank export.", toolCalls: [{ id: "c1", name: "read_file", arguments: { path: "bank.csv" } }] },
  { role: "tool", toolCallId: "c1", name: "read_file", content: "date,amount\n2026-10-01,42" },
  { role: "assistant", content: "Reconciled: one open item." },
  { role: "user", content: "Thanks" },
];

const listed = async () => (await h.get("/api/sessions")).body as Array<{ id: string; unread?: boolean; archived?: boolean; title: string }>;

describe("session search", () => {
  it("finds a phrase inside a transcript with a snippet, and skips trashed sessions", async () => {
    await saveSession("inv", TRANSCRIPT, { env: process.env, title: "Invoices" });
    await saveSession("gone", [{ role: "user", content: "reconciliation of the gone session" }], { env: process.env, title: "Gone" });
    await setSessionTrashed("gone", true, process.env);

    const { results } = (await h.get("/api/sessions/search?q=RECONCILIATION")).body;
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ sessionId: "inv", title: "Invoices", role: "user" });
    expect(results[0].snippet.toLowerCase()).toContain("reconciliation");
    expect((await h.get("/api/sessions/search?q=nothing-matches-this")).body.results).toEqual([]);
    expect((await h.get("/api/sessions/search")).status).toBe(400);
  });
});

describe("unread watermark", () => {
  it("marks unread and read, flags a session that moved on after being read, and marks all read", async () => {
    await saveSession("a", TRANSCRIPT, { env: process.env, title: "A" });
    await saveSession("b", TRANSCRIPT, { env: process.env, title: "B" });
    expect((await listed()).some((s) => s.unread)).toBe(false);

    expect((await h.post("/api/sessions/unread", { id: "a", unread: true })).body).toMatchObject({ ok: true, unread: true });
    expect((await listed()).find((s) => s.id === "a")?.unread).toBe(true);

    await h.post("/api/sessions/unread", { id: "a", unread: false });
    expect((await listed()).find((s) => s.id === "a")?.unread).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveSession("a", [...TRANSCRIPT, { role: "assistant", content: "Background update finished." }], { env: process.env });
    expect((await listed()).find((s) => s.id === "a")?.unread).toBe(true);

    await h.post("/api/sessions/unread", { id: "b", unread: true });
    expect((await h.post("/api/sessions/unread", { all: true })).body).toMatchObject({ ok: true, marked: 2 });
    expect((await listed()).some((s) => s.unread)).toBe(false);
  });

  it("rejects an unknown session and a malformed body", async () => {
    expect((await h.post("/api/sessions/unread", { id: "ghost", unread: true })).status).toBe(404);
    expect((await h.post("/api/sessions/unread", { id: "a" })).status).toBe(400);
  });
});

describe("session export and fork", () => {
  it("exports Markdown and JSON transcripts without the system prompt", async () => {
    await saveSession("inv", TRANSCRIPT, { env: process.env, title: "Invoices" });
    const md = (await h.get("/api/sessions/export?id=inv")).body;
    expect(md).toMatchObject({ format: "markdown", mime: "text/markdown" });
    expect(md.filename).toMatch(/^invoices-inv\.md$/);
    expect(md.content).toContain("## You\n\nPlan the invoice reconciliation");
    expect(md.content).toContain("Tool: read_file");
    expect(md.content).not.toContain("You are Vanta.");

    const json = (await h.get("/api/sessions/export?id=inv&format=json")).body;
    expect(JSON.parse(json.content).messages).toHaveLength(5);
    expect((await h.get("/api/sessions/export?id=ghost")).status).toBe(404);
  });

  it("branches at a message, never leaves a tool call unanswered, and leaves the parent alone", async () => {
    await saveSession("inv", TRANSCRIPT, { env: process.env, title: "Invoices" });
    const whole = (await h.post("/api/sessions/fork", { id: "inv" })).body;
    expect(whole).toMatchObject({ ok: true, title: "Invoices (branch)", parentId: "inv", messageCount: 5 });

    const cut = (await h.post("/api/sessions/fork", { id: "inv", count: 2 })).body;
    expect(cut.messageCount).toBe(1);
    const branch = await loadSession(cut.id, process.env);
    expect(branch?.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect((await loadSession("inv", process.env))?.messages).toHaveLength(6);

    expect((await h.post("/api/sessions/fork", { id: "ghost" })).status).toBe(404);
  });

  it("keeps archived sessions in the list so the Archived view and unarchive work", async () => {
    await saveSession("old", TRANSCRIPT, { env: process.env, title: "Old" });
    await setSessionArchived("old", true, process.env);
    expect((await listed()).find((s) => s.id === "old")).toMatchObject({ archived: true });
    await h.post("/api/sessions/archive", { id: "old", archived: false });
    expect((await listed()).find((s) => s.id === "old")?.archived).toBeUndefined();
  });
});
