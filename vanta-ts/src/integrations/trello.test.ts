import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrelloCard, listTrelloBoards, searchTrello, trelloAuthorizationUrl, updateTrelloCard } from "./trello.js";
import { trelloReadTool } from "../tools/trello-read.js";
import { trelloWriteTool } from "../tools/trello-write.js";
import type { ToolContext } from "../tools/types.js";

const env = { VANTA_TRELLO_KEY: "key", VANTA_TRELLO_TOKEN: "token", VANTA_TRELLO_WRITE_TOKEN: "write-token", VANTA_TRELLO_API_BASE: "https://trello.test" };
const response = (value: unknown, status = 200) => ({ ok: status < 300, status, json: async () => value }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe("Trello contract", () => {
  it("uses delegated credentials without returning them in a read result", async () => {
    const fetcher = vi.fn(async (url: URL) => response([{ id: "b1", name: "Board" }]));
    await expect(listTrelloBoards(env, fetcher as unknown as typeof fetch)).resolves.toEqual([{ id: "b1", name: "Board" }]);
    expect(fetcher.mock.calls[0]?.[0].toString()).toContain("key=key");
    expect(trelloAuthorizationUrl(env)).toContain("scope=read");
    expect(trelloAuthorizationUrl(env, "write")).toContain("scope=read%2Cwrite");
  });

  it("covers search, create, update, and actionable remote errors", async () => {
    const fetcher = vi.fn(async (url: URL, init?: RequestInit) => response(url.pathname === "/1/search" ? { boards: [], cards: [{ id: "c1", name: "Found" }], organizations: [] }
      : url.pathname === "/1/cards/c1" && init?.method === "GET" ? { dateLastActivity: "2026-07-23T00:00:00Z" }
        : { id: "c1", name: "Card" }));
    await expect(searchTrello("roadmap", env, fetcher as unknown as typeof fetch)).resolves.toMatchObject({ cards: [{ id: "c1" }] });
    await expect(createTrelloCard({ listId: "l1", name: "Card" }, env, fetcher as unknown as typeof fetch)).resolves.toMatchObject({ id: "c1" });
    await expect(updateTrelloCard({ cardId: "c1", expectedDateLastActivity: "2026-07-23T00:00:00Z", name: "Renamed" }, env, fetcher as unknown as typeof fetch)).resolves.toMatchObject({ id: "c1" });
    await expect(updateTrelloCard({ cardId: "c1", expectedDateLastActivity: "stale", name: "Renamed" }, env, fetcher as unknown as typeof fetch)).rejects.toThrow("changed since it was read");
    await expect(listTrelloBoards(env, vi.fn(async () => response({}, 429)) as unknown as typeof fetch)).rejects.toThrow("rate limit");
  });
});

describe("Trello tools", () => {
  it("rejects malformed reads and gates every write before network access", async () => {
    expect((await trelloReadTool.execute({ action: "list_cards" }, {} as ToolContext)).ok).toBe(false);
    const denied = await trelloWriteTool.execute({ action: "create_card", listId: "l1", name: "Card" }, { root: "/tmp/vanta-trello", requestApproval: async () => false } as unknown as ToolContext);
    expect(denied).toEqual({ ok: false, output: "denied by user" });
  });
});
