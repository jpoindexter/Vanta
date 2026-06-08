import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addRef, searchRefs, listRefs, detectRefType, formatRefs } from "./store.js";

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-refs-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await rm(home, { recursive: true }).catch(() => {});
});

describe("detectRefType", () => {
  it("detects URL", () => expect(detectRefType("https://example.com")).toBe("url"));
  it("detects image", () => expect(detectRefType("/tmp/screen.png")).toBe("image"));
  it("detects transcript", () => expect(detectRefType("/tmp/chat.md")).toBe("transcript"));
  it("defaults to file", () => expect(detectRefType("/tmp/foo.ts")).toBe("file"));
});

describe("addRef / listRefs / searchRefs", () => {
  it("adds a ref and lists it", async () => {
    await addRef({ source: "https://example.com", excerpt: "Example site content.", env });
    const refs = await listRefs(env);
    expect(refs.length).toBe(1);
    expect(refs[0]?.source).toBe("https://example.com");
  });

  it("updates an existing ref with the same source", async () => {
    await addRef({ source: "https://example.com", excerpt: "v1", env });
    await addRef({ source: "https://example.com", excerpt: "v2", env });
    const refs = await listRefs(env);
    expect(refs.length).toBe(1);
    expect(refs[0]?.excerpt).toBe("v2");
  });

  it("searches by excerpt keyword", async () => {
    await addRef({ source: "https://a.com", excerpt: "tailwind css utilities", env });
    await addRef({ source: "https://b.com", excerpt: "rust ownership model", env });
    const results = await searchRefs("tailwind", env);
    expect(results.length).toBe(1);
    expect(results[0]?.source).toBe("https://a.com");
  });

  it("returns all refs when query matches nothing", async () => {
    await addRef({ source: "https://a.com", excerpt: "foo", env });
    const results = await searchRefs("zzznomatch", env);
    expect(results.length).toBe(0);
  });
});

describe("formatRefs", () => {
  it("shows empty message when no refs", () => {
    expect(formatRefs([])).toContain("no references");
  });
});
