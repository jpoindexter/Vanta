import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delegatedWriteDenial } from "./delegated-write-guard.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import type { ToolContext } from "./types.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const context = (root: string): ToolContext => ({ root, safety: {} as ToolContext["safety"], requestApproval: async () => true });

it("ordinary nondelegated tools do not consult a grant callback", () => {
  expect(delegatedWriteDenial({ ...context("/project"), delegatedWriteCheck: () => { throw new Error("must not run"); } })).toBeNull();
});

it.each([undefined, () => false, () => { throw new Error("read failure"); }])("fails closed when a delegated authority cannot be checked", check => {
  expect(delegatedWriteDenial({ ...context("/project"), delegatedWritePath: "/project/a.txt", delegatedWriteCheck: check })).toMatchObject({ ok: false, effectDisposition: "denied" });
});

it.each(["write", "edit"])("%s refuses a grant revoked during its own awaited confirmation", async kind => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "file-revoke-"))); roots.push(root);
  const target = join(root, "note.txt"); await writeFile(target, "original"); let active = true, decisions = 0;
  const ctx = { ...context(root), delegatedWritePath: target, delegatedWriteCheck: () => active,
    requestApproval: async () => { decisions++; active = false; return true; } };
  const result = kind === "write" ? await writeFileTool.execute({ path: target, content: "changed" }, ctx)
    : await editFileTool.execute({ path: target, old_string: "original", new_string: "changed" }, ctx);
  expect(decisions).toBeGreaterThan(0);
  expect(result).toMatchObject({ ok: false, effectDisposition: "denied" });
  expect(result.output).toContain("Delegated authority changed");
  expect(await readFile(target, "utf8")).toBe("original");
});

it.each(["write", "edit"])("%s retains an unchanged delegated decision", async kind => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "file-active-"))); roots.push(root);
  const target = join(root, "note.txt"); if (kind === "edit") await writeFile(target, "original");
  const ctx = { ...context(root), delegatedWritePath: target, delegatedWriteCheck: () => true };
  const result = kind === "write" ? await writeFileTool.execute({ path: target, content: "changed" }, ctx)
    : await editFileTool.execute({ path: target, old_string: "original", new_string: "changed" }, ctx);
  expect(result.ok).toBe(true); expect(await readFile(target, "utf8")).toBe("changed");
});
