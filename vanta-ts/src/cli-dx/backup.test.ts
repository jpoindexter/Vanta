import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { storeDir, backupArgs, importArgs, runBackup, runImport } from "./backup.js";

describe("storeDir", () => {
  it("defaults to ~/.vanta, honors VANTA_HOME (+ ~ expansion)", () => {
    expect(storeDir({})).toBe(join(homedir(), ".vanta"));
    expect(storeDir({ VANTA_HOME: "~/custom" })).toBe(join(homedir(), "custom"));
    expect(storeDir({ VANTA_HOME: "/abs/store" })).toBe("/abs/store");
  });
});

describe("backupArgs / importArgs", () => {
  it("archive holds the store basename (no absolute paths)", () => {
    expect(backupArgs("/home/u/.vanta", "/tmp/out.tgz")).toEqual(["-czf", "/tmp/out.tgz", "-C", "/home/u", ".vanta"]);
    expect(importArgs("/home/u/.vanta", "/tmp/in.tgz")).toEqual(["-xzf", "/tmp/in.tgz", "-C", "/home/u"]);
  });
});

describe("backup → import roundtrip (real tar)", () => {
  it("restores the store contents", async () => {
    const base = await mkdtemp(join(tmpdir(), "vanta-bk-"));
    const store = join(base, ".vanta");
    await mkdir(store, { recursive: true });
    await writeFile(join(store, "marker.txt"), "hello-backup", "utf8");
    const out = join(base, "backup.tgz");

    expect(await runBackup([out], { VANTA_HOME: store })).toBe(0);
    await rm(store, { recursive: true, force: true }); // wipe, then restore
    expect(await runImport([out], { VANTA_HOME: store })).toBe(0);
    expect(await readFile(join(store, "marker.txt"), "utf8")).toBe("hello-backup");
  });

  it("import without an archive arg returns usage (1)", async () => {
    expect(await runImport([], {})).toBe(1);
  });
});
