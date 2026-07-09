import { describe, expect, it } from "vitest";
import { handleChat, type DesktopState } from "./handlers.js";

describe("desktop chat concurrency", () => {
  it("rejects an overlapping turn before reading another request body", async () => {
    const state: DesktopState = { root: "/repo", _chatActive: true };
    let status = 0; let body = "";
    const res = { writeHead: (next: number) => { status = next; }, end: (next: string) => { body = next; } } as any;
    await handleChat(state, {} as any, res);
    expect(status).toBe(409);
    expect(JSON.parse(body)).toEqual({ error: "a turn is already running" });
  });
});
