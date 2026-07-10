import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./types.js";
import { v2exReadTool } from "./v2ex-read.js";

const ctx = {} as ToolContext;

afterEach(() => {
  vi.restoreAllMocks();
});

function response(json: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response;
}

const TOPIC = {
  id: 42,
  title: "Use Vanta on a phone?",
  url: "https://www.v2ex.com/t/42",
  replies: 3,
  created: 1783690000,
  node: { name: "python", title: "Python" },
  member: { username: "jason" },
};

describe("v2ex_read", () => {
  it("validates action", async () => {
    const r = await v2exReadTool.execute({}, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("v2ex_read needs");
  });

  it("reads hot topics from the public JSON API", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://www.v2ex.com/api/topics/hot.json");
      return response([TOPIC]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await v2exReadTool.execute({ action: "hot" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("V2EX hot");
    expect(r.output).toContain("Use Vanta on a phone?");
    expect(r.output).toContain("https://www.v2ex.com/t/42");
  });

  it("reads node topics and honors limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://www.v2ex.com/api/topics/show.json?node_name=python");
      return response([TOPIC, { ...TOPIC, id: 43, title: "Second" }]);
    }));
    const r = await v2exReadTool.execute({ action: "node", node: "python", limit: 1 }, ctx);
    expect(r.output).toContain("V2EX /python — 1 topic(s)");
    expect(r.output).not.toContain("Second");
  });

  it("reads replies", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://www.v2ex.com/api/replies/show.json?topic_id=42");
      return response([{ id: 1, content_rendered: "<p>Hello Vanta</p>", member: { username: "alice" }, created: 1783690000 }]);
    }));
    const r = await v2exReadTool.execute({ action: "replies", topicId: 42 }, ctx);
    expect(r.output).toContain("@alice");
    expect(r.output).toContain("Hello Vanta");
  });

  it("reads a member profile", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://www.v2ex.com/api/members/show.json?username=Livid");
      return response({ id: 1, username: "Livid", url: "https://www.v2ex.com/u/Livid", tagline: "Remember" });
    }));
    const r = await v2exReadTool.execute({ action: "member", username: "Livid" }, ctx);
    expect(r.output).toContain("V2EX member Livid");
    expect(r.output).toContain("Remember");
  });

  it("returns fetch errors as values", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ error: "nope" }, 503)));
    const r = await v2exReadTool.execute({ action: "hot" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("HTTP 503");
  });
});
