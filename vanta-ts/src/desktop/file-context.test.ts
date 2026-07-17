import { describe, expect, it } from "vitest";
import { buildDesktopFileContext, isSafeProjectFile, parseChangedFiles } from "./file-context.js";

describe("desktop file context", () => {
  it("filters private paths and orders changed and recent files", async () => {
    const times: Record<string, number> = { "src/a.ts": 2, "README.md": 3, "docs/guide.md": 1 };
    const context = await buildDesktopFileContext("/repo", {
      list: async () => ["src/a.ts", ".env", "private/token.pem", "README.md", "docs/guide.md", ".vanta/state.json"],
      changed: async () => ["src/a.ts", ".env"],
      modifiedAt: async (path) => times[path] ?? 0,
    });
    expect(context).toEqual({
      files: ["docs/guide.md", "README.md", "src/a.ts"],
      changed: ["src/a.ts"],
      recent: ["README.md", "src/a.ts", "docs/guide.md"],
    });
  });

  it("recognizes private credentials and porcelain rename records", () => {
    expect(isSafeProjectFile(".github/workflows/test.yml")).toBe(true);
    expect(isSafeProjectFile("config/.env.local")).toBe(false);
    expect(isSafeProjectFile("certs/signing.p12")).toBe(false);
    expect(parseChangedFiles(" M src/a.ts\0R  src/new.ts\0src/old.ts\0?? docs/new.md\0")).toEqual(["src/a.ts", "src/new.ts", "docs/new.md"]);
  });
});
