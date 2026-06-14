import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cookieImportTool } from "./cookie-import.js";
import { loadCookie } from "../reach/cookie.js";
import type { ToolContext } from "./types.js";

const ctx = {} as ToolContext;

let home: string;
let prev: string | undefined;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-ci-"));
  prev = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});
afterEach(() => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  rmSync(home, { recursive: true, force: true });
});

describe("cookie_import", () => {
  it("stores a cookie and confirms WITHOUT echoing the value", async () => {
    const r = await cookieImportTool.execute({ channel: "reddit", cookie: "session=secret123" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("reddit");
    expect(r.output).not.toContain("secret123"); // never leak the cookie
    expect(loadCookie("reddit")).toBe("session=secret123");
  });

  it("rejects missing args + an unparseable cookie", async () => {
    expect((await cookieImportTool.execute({ channel: "reddit" }, ctx)).ok).toBe(false);
    expect((await cookieImportTool.execute({ channel: "reddit", cookie: "garbage" }, ctx)).ok).toBe(false);
  });

  it("describeForSafety signals credential handling (kernel gates it) without the value", () => {
    const d = cookieImportTool.describeForSafety?.({ channel: "reddit", cookie: "session=secret123" });
    expect(d).toBe("store a login cookie for reddit");
    expect(d).not.toContain("secret123");
  });
});
