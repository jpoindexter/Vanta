import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildLineDiff } from "../acp/edit-policy.js";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import type { ToolContext } from "./types.js";
import { captureWriteTarget } from "./file-write-target.js";
import { writeFileTool } from "./write-file.js";
import { ordinaryOverwriteConfirmation } from "./write-file-overwrite.js";

let root: string;
const before = "Original café\n";
const after = "Replacement résumé\n";
const digest = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "vanta-ordinary-overwrite-")));
  vi.stubEnv("VANTA_HOME", join(root, "fixture-home"));
  globalFileCheckpointStore.clear();
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "notes.txt"), before);
  await writeFile(join(root, "nested/notes.txt"), before);
});

afterEach(async () => {
  globalFileCheckpointStore.clear();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function context(requestApproval: ToolContext["requestApproval"]): ToolContext {
  return { root, safety: {} as ToolContext["safety"], requestApproval };
}

function preview(content: string | Buffer = before): string {
  return `Target: ${join(root, "notes.txt")}\nBefore: ${Buffer.byteLength(content)} bytes; SHA-256 ${digest(content)}\nAfter: ${Buffer.byteLength(after)} bytes; SHA-256 ${digest(after)}\n\n${buildLineDiff(content.toString(), after)}`;
}

it.each([true, false])("requires exact fresh one-time ordinary replacement approval: %s", async (allow) => {
  const approve = vi.fn<ToolContext["requestApproval"]>(async () => allow);
  const result = await writeFileTool.execute({ path: "notes.txt", content: after }, context(approve));
  expect(approve).toHaveBeenCalledExactlyOnceWith(
    `Overwrite existing file ${join(root, "notes.txt")}`,
    expect.stringContaining("fresh one-time"), "write_file",
    { fresh: true, canRemember: false, diff: preview() },
  );
  expect(result.ok).toBe(allow);
  expect(result.effectDisposition).toBe(allow ? "confirmed" : "denied");
  expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(allow ? after : before);
  expect(globalFileCheckpointStore.list()).toHaveLength(allow ? 1 : 0);
  if (allow) expect(result.verification?.status).toBe("verified");
});

it("fingerprints the exact captured bytes, not a lossy UTF-8 reread", async () => {
  const bytes = Buffer.from([255, 0, 195, 169]);
  await writeFile(join(root, "notes.txt"), bytes);
  const approve = vi.fn<ToolContext["requestApproval"]>(async () => false);
  await writeFileTool.execute({ path: "notes.txt", content: after }, context(approve));
  expect(approve.mock.calls[0]?.[3]?.diff).toBe(preview(bytes));
  expect(await readFile(join(root, "notes.txt"))).toEqual(bytes);
});

it.each(["nested/../notes.txt", "leaf-alias.txt", "parent-alias/notes.txt"])("refuses raw ordinary alias %s before asking", async (path) => {
  await symlink(join(root, "notes.txt"), join(root, "leaf-alias.txt"));
  await symlink(join(root, "nested"), join(root, "parent-alias"));
  const approve = vi.fn<ToolContext["requestApproval"]>(async () => true);
  const result = await writeFileTool.execute({ path, content: after }, context(approve));
  expect(result.ok).toBe(false);
  expect(result.output).toMatch(/alias|traversal|canonical/i);
  expect(approve).not.toHaveBeenCalled();
  expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(before);
  expect(await readFile(join(root, "nested/notes.txt"), "utf8")).toBe(before);
  expect(globalFileCheckpointStore.list()).toEqual([]);
});

async function mutateWhileApproving(kind: string) {
  const path = join(root, "notes.txt");
  if (kind === "content") return writeFile(path, "External edit\n");
  if (kind === "hardlink") return link(path, join(root, "late-link.txt"));
  await rename(path, join(root, "retained-notes.txt"));
  if (kind === "symlink") return symlink(join(root, "nested/notes.txt"), path);
  return writeFile(path, before);
}

it.each(["content", "hardlink", "symlink", "inode"])("rejects stale ordinary target after approval: %s", async (kind) => {
  const approve = vi.fn<ToolContext["requestApproval"]>(async () => { await mutateWhileApproving(kind); return true; });
  const result = await writeFileTool.execute({ path: "notes.txt", content: after }, context(approve));
  expect(result.ok).toBe(false);
  expect(result.output).toMatch(/changed|stale|replaced/i);
  expect(approve).toHaveBeenCalledTimes(1);
  expect(approve.mock.calls[0]?.[3]).toEqual({ fresh: true, canRemember: false, diff: preview() });
  expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(kind === "content" ? "External edit\n" : before);
  expect(globalFileCheckpointStore.list()).toEqual([]);
});

it("a denied replacement is not reused by a later call", async () => {
  const approve = vi.fn<ToolContext["requestApproval"]>().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const ctx = context(approve);
  const first = await writeFileTool.execute({ path: "notes.txt", content: after }, ctx);
  const second = await writeFileTool.execute({ path: "notes.txt", content: after }, ctx);
  const third = await writeFileTool.execute({ path: "notes.txt", content: "Unapproved later edit\n" }, ctx);
  expect([first.effectDisposition, second.effectDisposition, third.effectDisposition]).toEqual(["denied", "confirmed", "denied"]);
  expect(approve).toHaveBeenCalledTimes(3);
  for (const call of approve.mock.calls) expect(call[3]).toMatchObject({ fresh: true, canRemember: false });
  expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(after);
});

it("defensively refuses a captured multiple-hardlink target in the ordinary-only helper", async () => {
  await link(join(root, "notes.txt"), join(root, "linked.txt"));
  const target = captureWriteTarget(join(root, "notes.txt"));
  const confirmation = ordinaryOverwriteConfirmation({ path: "notes.txt", root, target, content: after, controlPlane: false });
  expect(confirmation).toEqual({ ok: false, error: expect.stringContaining("multiple hard links") });
  expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(before);
  expect(globalFileCheckpointStore.list()).toEqual([]);
});

it("preserves the existing distinct control-plane approval for pre-existing hard links", async () => {
  await link(join(root, "notes.txt"), join(root, "linked.txt"));
  const approve = vi.fn<ToolContext["requestApproval"]>(async () => false);
  const result = await writeFileTool.execute({ path: "notes.txt", content: after }, context(approve));
  expect(result.effectDisposition).toBe("denied");
  expect(approve).toHaveBeenCalledTimes(1);
  expect(approve.mock.calls[0]?.[0]).toContain("Modify project control-plane file");
  expect(approve.mock.calls[0]?.[3]).toEqual({ fresh: true });
  expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(before);
});
