import { describe, it, expect } from "vitest";
import { resolveInScope } from "./scope.js";

const ROOT = "/Users/jason/projects/argo";

describe("resolveInScope", () => {
  it("allows a relative path inside root", () => {
    const r = resolveInScope("src/app.ts", ROOT);
    expect(r.ok).toBe(true);
    expect(r.path).toBe(`${ROOT}/src/app.ts`);
  });

  it("allows the root itself", () => {
    expect(resolveInScope(".", ROOT).ok).toBe(true);
  });

  it("rejects parent traversal escaping root", () => {
    expect(resolveInScope("../other/secret.txt", ROOT).ok).toBe(false);
  });

  it("rejects an absolute path outside root", () => {
    expect(resolveInScope("/etc/passwd", ROOT).ok).toBe(false);
  });

  it("rejects a sibling dir sharing a name prefix", () => {
    expect(resolveInScope("/Users/jason/projects/argo-evil", ROOT).ok).toBe(false);
  });
});
