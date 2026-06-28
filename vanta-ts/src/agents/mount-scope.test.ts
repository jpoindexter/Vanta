import { describe, it, expect } from "vitest";
import { classifyMountIntent, deriveMountScope } from "./mount-scope.js";

// VANTA-A2A-MOUNT-SCOPE — Vanta picks the agent's blast radius (the mount-set) from the task, shows
// it for approval, and flags a destructive-within-scope task for a dry-run first.
describe("classifyMountIntent — task → blast-radius intent", () => {
  it("a build/create task is a non-destructive write", () => {
    const i = classifyMountIntent("build a landing page for the launch");
    expect(i.kind).toBe("build");
    expect(i.destructive).toBe(false);
  });
  it("a clean/organize task is destructive (needs a dry-run)", () => {
    expect(classifyMountIntent("clean up and organize my Downloads folder").destructive).toBe(true);
    expect(classifyMountIntent("delete the stale build artifacts").destructive).toBe(true);
  });
  it("a review/read task is read-only", () => {
    expect(classifyMountIntent("review and summarize the code in src").kind).toBe("read");
  });
  it("a fix/refactor task modifies in place", () => {
    expect(classifyMountIntent("fix the failing test in auth.ts").kind).toBe("modify");
  });
});

describe("deriveMountScope — exactly the folders the task needs", () => {
  it("a build mounts the output dir rw at /work, inputs ro", () => {
    const s = deriveMountScope({ task: "build the site", outputDir: "/tmp/out", readDirs: ["/repo"] });
    expect(s.workdir).toBe("/work");
    expect(s.mounts).toContainEqual({ host: "/tmp/out", container: "/work", mode: "rw" });
    expect(s.mounts).toContainEqual({ host: "/repo", container: "/ro/0", mode: "ro" });
    expect(s.dryRun).toBe(false);
  });
  it("a read task mounts its target read-only (no write access at all)", () => {
    const s = deriveMountScope({ task: "analyze the logs", outputDir: "/var/logs" });
    expect(s.mounts[0]).toEqual({ host: "/var/logs", container: "/work", mode: "ro" });
  });
  it("a destructive task dry-runs read-only (OS-enforced — the agent physically can't write)", () => {
    const s = deriveMountScope({ task: "clean out ~/Downloads", outputDir: "/home/u/Downloads" });
    expect(s.dryRun).toBe(true);
    expect(s.summary).toMatch(/dry-run/i);
    expect(s.mounts[0]?.mode).toBe("ro");
  });

  it("apply:true on a destructive task writes (rw) — the confirmed second pass", () => {
    const s = deriveMountScope({ task: "clean out ~/Downloads", outputDir: "/home/u/Downloads", apply: true });
    expect(s.dryRun).toBe(false);
    expect(s.mounts[0]?.mode).toBe("rw");
  });
});
