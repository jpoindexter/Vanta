import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRoomsList, resolveRoomOrExit, runModes } from "./commands.js";
import { OPERATOR_MODES } from "../modes/builtin.js";

describe("projects/commands", () => {
  let projectsDir: string;
  let home: string;
  let env: NodeJS.ProcessEnv;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), "argo-pcmd-rooms-"));
    home = await mkdtemp(join(tmpdir(), "argo-pcmd-home-"));
    env = { ...process.env, ARGO_PROJECTS_DIR: projectsDir, ARGO_HOME: home };
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    log.mockRestore();
    await rm(projectsDir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  // Every console.log arg joined, so assertions don't depend on call grouping.
  function output(): string {
    return log.mock.calls.map((c) => c.join(" ")).join("\n");
  }

  describe("runRoomsList", () => {
    it("prints '(no projects found ...)' for an empty base", async () => {
      await runRoomsList(env);
      expect(output()).toContain("(no projects found under");
      expect(output()).toContain(projectsDir);
    });

    it("prints each room as '<name>  <path>'", async () => {
      await mkdir(join(projectsDir, "brutal"));
      await mkdir(join(projectsDir, "argo"));
      await runRoomsList(env);
      expect(output()).toContain(`argo  ${join(projectsDir, "argo")}`);
      expect(output()).toContain(`brutal  ${join(projectsDir, "brutal")}`);
    });
  });

  describe("resolveRoomOrExit", () => {
    it("returns the room on a hit", async () => {
      await mkdir(join(projectsDir, "indx"));
      const room = await resolveRoomOrExit("indx", env);
      expect(room).toEqual({ name: "indx", path: join(projectsDir, "indx") });
    });

    it("prints an error and returns null on a miss", async () => {
      const room = await resolveRoomOrExit("nope", env);
      expect(room).toBeNull();
      expect(output()).toContain('No project named "nope"');
    });
  });

  describe("runModes", () => {
    it("lists every mode as not-installed before any install", async () => {
      await runModes(env, "list");
      const out = output();
      for (const mode of OPERATOR_MODES) {
        expect(out).toContain(`[not installed] ${mode.name}`);
      }
      expect(out).toContain("argo modes install");
    });

    it("installs all modes and reports the count", async () => {
      await runModes(env, "install");
      const out = output();
      expect(out).toContain(`installed ${OPERATOR_MODES.length} operator mode(s)`);
      for (const mode of OPERATOR_MODES) expect(out).toContain(mode.name);
    });

    it("reflects installed state in the list after install", async () => {
      await runModes(env, "install");
      log.mockClear();
      await runModes(env, "list");
      const out = output();
      for (const mode of OPERATOR_MODES) {
        expect(out).toContain(`[installed] ${mode.name}`);
      }
      expect(out).not.toContain("[not installed]");
    });

    it("prints usage for an unknown subcommand", async () => {
      await runModes(env, "frobnicate");
      expect(output()).toContain("Usage: argo modes [list|install]");
    });
  });
});
