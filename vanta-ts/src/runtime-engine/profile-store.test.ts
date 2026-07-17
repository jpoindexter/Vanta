import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRuntimeProfile } from "./profile-contract.js";
import {
  cloneRuntimeProfile,
  createStoredRuntimeProfile,
  exportRuntimeProfile,
  importRuntimeProfile,
  linkRuntimeProfileModel,
  listRuntimeProfiles,
  readRuntimeProfile,
  readSelectedRuntimeProfile,
  selectRuntimeProfile,
} from "./profile-store.js";

const gib = 1024 ** 3;
let root: string;
let otherRoot: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-runtime-profiles-"));
  otherRoot = await mkdtemp(join(tmpdir(), "vanta-runtime-profiles-import-"));
});

afterEach(async () => {
  await Promise.all([rm(root, { recursive: true, force: true }), rm(otherRoot, { recursive: true, force: true })]);
});

function input(id: string) {
  return { id, name: id, backend: "llama_cpp" as const, modelPath: `/models/${id}.gguf`, modelBytes: gib, availableMemoryBytes: 8 * gib };
}

describe("runtime profile store", () => {
  it("creates, clones, selects, and reloads a project-scoped profile", async () => {
    await createStoredRuntimeProfile(root, input("daily"), () => new Date("2026-07-17T12:00:00.000Z"));
    const clone = await cloneRuntimeProfile(root, { sourceId: "daily", id: "daily-safe", name: "Daily safe" }, () => new Date("2026-07-17T12:05:00.000Z"));
    await selectRuntimeProfile(root, clone.id, () => new Date("2026-07-17T12:06:00.000Z"));

    expect((await listRuntimeProfiles(root)).map((profile) => profile.id)).toEqual(["daily", "daily-safe"]);
    expect(await readSelectedRuntimeProfile(root)).toMatchObject({ id: "daily-safe", clonedFrom: "daily" });
  });

  it("exports and imports a portable profile without embedding secrets", async () => {
    const profile = createRuntimeProfile({ ...input("portable"), environment: [{ name: "MODEL_TOKEN", secretRef: "secret://runtime/model-token" }] });
    await createStoredRuntimeProfile(root, profile);
    const exported = await exportRuntimeProfile(root, "portable");
    const path = join(otherRoot, "portable.json");
    await writeFile(path, exported, "utf8");
    await importRuntimeProfile(otherRoot, JSON.parse(await readFile(path, "utf8")));

    expect(exported).toContain("secret://runtime/model-token");
    expect(exported).not.toContain("plain-text-token");
    expect(await listRuntimeProfiles(otherRoot)).toMatchObject([{ id: "portable" }]);
  });

  it("rejects an invalid import with actionable recovery copy", async () => {
    await expect(importRuntimeProfile(root, { version: 2, id: "broken" })).rejects.toThrow("Fix the profile fields");
  });

  it("links a verified model artifact without changing the profile contract", async () => {
    await createStoredRuntimeProfile(root, input("linked"));
    const linked = await linkRuntimeProfileModel(root, "linked", "/models/verified.gguf", 42, () => new Date("2026-07-17T12:00:00.000Z"));
    expect(linked.model).toEqual({ path: "/models/verified.gguf", bytes: 42 });
    expect((await readRuntimeProfile(root, "linked")).model).toEqual(linked.model);
  });
});
