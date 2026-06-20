import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SafetyClient } from "../safety-client.js";
import type { ToolContext } from "./types.js";
import { writeFileTool } from "./write-file.js";

// write_file only touches root + requestApproval here; safety is never read.
function makeCtx(root: string, requestApproval: ToolContext["requestApproval"]): ToolContext {
  return { root, safety: {} as SafetyClient, requestApproval };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("write_file shell-startup confirm (SHELL-STARTUP-WRITE-PROMPT)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-wf-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("asks an EXTRA confirm before writing a shell startup file in-zone", async () => {
    const reasons: string[] = [];
    const ctx = makeCtx(root, async (_action, reason) => {
      reasons.push(reason);
      return true;
    });
    const result = await writeFileTool.execute({ path: ".zshrc", content: "export FOO=1\n" }, ctx);
    expect(result.ok).toBe(true);
    expect(reasons.some((r) => r.includes("shell startup file"))).toBe(true);
    expect(await readFile(join(root, ".zshrc"), "utf8")).toBe("export FOO=1\n");
  });

  it("declined confirm → {ok:false} and NO file written (errors-as-values)", async () => {
    const ctx = makeCtx(root, async () => false);
    const result = await writeFileTool.execute({ path: ".bash_profile", content: "evil\n" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("shell startup file left unchanged");
    expect(await fileExists(join(root, ".bash_profile"))).toBe(false);
  });

  it("fires for a fish config.fish too", async () => {
    let asked = false;
    const ctx = makeCtx(root, async (_action, reason) => {
      if (reason.includes("shell startup file")) asked = true;
      return true;
    });
    const result = await writeFileTool.execute({ path: "config.fish", content: "set -x FOO 1\n" }, ctx);
    expect(result.ok).toBe(true);
    expect(asked).toBe(true);
  });

  it("a NORMAL file write is unchanged — no extra confirm, writes directly", async () => {
    let asked = false;
    const ctx = makeCtx(root, async () => {
      asked = true;
      return true; // would approve if asked, but a new normal in-root write must not ask
    });
    const result = await writeFileTool.execute({ path: "notes.md", content: "# hi\n" }, ctx);
    expect(result.ok).toBe(true);
    expect(asked).toBe(false);
    expect(await readFile(join(root, "notes.md"), "utf8")).toBe("# hi\n");
  });
});

describe("write_file git-hooks confirm (VANTA-ACCEPTEDITS-HUSKY)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-wf-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("asks an EXTRA confirm before writing a .husky hook in-zone", async () => {
    const reasons: string[] = [];
    const ctx = makeCtx(root, async (_action, reason) => {
      reasons.push(reason);
      return true;
    });
    const result = await writeFileTool.execute({ path: ".husky/pre-commit", content: "echo hi\n" }, ctx);
    expect(result.ok).toBe(true);
    expect(reasons.some((r) => r.includes("git-hooks file"))).toBe(true);
    expect(await readFile(join(root, ".husky/pre-commit"), "utf8")).toBe("echo hi\n");
  });

  it("asks an EXTRA confirm before writing a .git/hooks hook", async () => {
    let asked = false;
    const ctx = makeCtx(root, async (_action, reason) => {
      if (reason.includes("git-hooks file")) asked = true;
      return true;
    });
    const result = await writeFileTool.execute({ path: ".git/hooks/pre-push", content: "echo hi\n" }, ctx);
    expect(result.ok).toBe(true);
    expect(asked).toBe(true);
  });

  it("declined confirm → {ok:false} and NO file written (errors-as-values)", async () => {
    const ctx = makeCtx(root, async () => false);
    const result = await writeFileTool.execute({ path: ".husky/pre-commit", content: "evil\n" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("git-hooks file left unchanged");
    expect(await fileExists(join(root, ".husky/pre-commit"))).toBe(false);
  });

  it("a file merely named hooks.ts is a NORMAL write — no git-hooks confirm", async () => {
    let asked = false;
    const ctx = makeCtx(root, async (_action, reason) => {
      if (reason.includes("git-hooks file")) asked = true;
      return true;
    });
    const result = await writeFileTool.execute({ path: "src/hooks.ts", content: "export const x = 1;\n" }, ctx);
    expect(result.ok).toBe(true);
    expect(asked).toBe(false);
    expect(await readFile(join(root, "src/hooks.ts"), "utf8")).toBe("export const x = 1;\n");
  });
});
