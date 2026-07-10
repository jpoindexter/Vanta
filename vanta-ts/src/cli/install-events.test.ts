import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

describe("staged install events", () => {
  it("captures output and retries a failed stage once", async () => {
    const fixture = await makeFixture("retry");
    const script = `
      . "$HELPER"
      flaky() { if [ ! -f "$COUNT" ]; then touch "$COUNT"; echo first-failure; return 7; fi; echo retry-success; }
      vanta_install_init run.sh kernel,node,deps
      vanta_install_stage deps "Install dependencies" flaky
      vanta_install_finish
    `;
    await exec("sh", ["-c", script], { env: { ...process.env, ...fixture.env, VANTA_INSTALL_RETRY: "1", VANTA_INSTALL_QUIET: "1" } });

    const events = await readEvents(fixture.events);
    expect(events.map((event) => event.event)).toEqual(["Manifest", "Log", "StageStarted", "StageFailed", "StageRetry", "StageStarted", "StageCompleted", "InstallCompleted"]);
    expect(await readFile(fixture.log, "utf8")).toContain("first-failure");
    expect(await readFile(fixture.log, "utf8")).toContain("retry-success");
    expect((await stat(fixture.log)).mode & 0o777).toBe(0o600);
    expect((await stat(fixture.events)).mode & 0o777).toBe(0o600);
  });

  it("records terminal failure and prints retry/open-log recovery", async () => {
    const fixture = await makeFixture("failure");
    const script = `
      . "$HELPER"
      broken() { echo forensic-detail; return 9; }
      vanta_install_init run.sh kernel
      if vanta_install_stage kernel "Acquire kernel" broken; then exit 2; fi
    `;
    const { stderr } = await exec("sh", ["-c", script], { env: { ...process.env, ...fixture.env, VANTA_INSTALL_NONINTERACTIVE: "1" } });

    expect(stderr).toContain("VANTA_INSTALL_RETRY=1 ./run.sh");
    expect(stderr).toContain(`open log: ${fixture.log}`);
    expect((await readEvents(fixture.events)).map((event) => event.event)).toContain("InstallFailed");
    expect(await readFile(fixture.log, "utf8")).toContain("forensic-detail");
  });

  it("drives the real run.sh cold kernel stage through retry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-run-cold-")); dirs.push(dir);
    const sourceRoot = join(process.cwd(), "..");
    const log = join(dir, "home", "cold.log");
    const events = join(dir, "home", "cold.events.jsonl");
    await mkdir(join(dir, "scripts"), { recursive: true });
    await mkdir(join(dir, "vanta-ts", "node_modules", "tsx"), { recursive: true });
    await mkdir(join(dir, "fake-bin"), { recursive: true });
    await copyFile(join(sourceRoot, "run.sh"), join(dir, "run.sh"));
    await copyFile(join(sourceRoot, "scripts", "install-events.sh"), join(dir, "scripts", "install-events.sh"));
    await writeFile(join(dir, "scripts", "setup-lib.sh"), SETUP_FIXTURE, "utf8");
    await writeFile(join(dir, "fake-bin", "node"), '#!/bin/sh\n[ "$1" = -p ] && echo 22\nexit 0\n', "utf8");
    await writeFile(join(dir, "fake-bin", "cargo"), "#!/bin/sh\nexit 8\n", "utf8");
    await Promise.all(["run.sh", "fake-bin/node", "fake-bin/cargo"].map((path) => chmod(join(dir, path), 0o755)));

    await exec(join(dir, "run.sh"), ["--help"], { env: {
      ...process.env,
      PATH: `${join(dir, "fake-bin")}:${process.env.PATH}`,
      VANTA_HOME: join(dir, "home"),
      VANTA_INSTALL_LOG: log,
      VANTA_INSTALL_EVENT_LOG: events,
      VANTA_INSTALL_RETRY: "1",
      VANTA_INSTALL_NONINTERACTIVE: "1",
      VANTA_INSTALL_QUIET: "1",
    } });

    expect((await readEvents(events)).map((event) => event.event)).toEqual(["Manifest", "Log", "StageStarted", "StageFailed", "StageRetry", "StageStarted", "StageCompleted", "InstallCompleted"]);
    expect(await readFile(log, "utf8")).toContain("mock prebuilt ready");
  });
});

const SETUP_FIXTURE = `
vanta_use_vendored_node() { :; }
vanta_node_ready() { return 0; }
vanta_ensure_node() { return 0; }
vanta_fetch_prebuilt_kernel() {
  repo="$1"
  count_file="$repo/kernel-attempt"
  if [ ! -f "$count_file" ]; then touch "$count_file"; echo mock download failed; return 7; fi
  mkdir -p "$repo/target/debug"
  printf '#!/bin/sh\\nexit 0\\n' > "$repo/target/debug/vanta-kernel"
  chmod +x "$repo/target/debug/vanta-kernel"
  echo mock prebuilt ready
}
`;

async function makeFixture(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `vanta-install-${name}-`)); dirs.push(dir);
  const root = join(process.cwd(), "..");
  const log = join(dir, "install.log");
  const events = join(dir, "install.events.jsonl");
  return {
    log,
    events,
    env: {
      HELPER: join(root, "scripts", "install-events.sh"),
      COUNT: join(dir, "attempted"),
      VANTA_STATE_HOME: dir,
      VANTA_INSTALL_LOG: log,
      VANTA_INSTALL_EVENT_LOG: events,
      VANTA_INSTALL_RETRY_COMMAND: "./run.sh",
    },
  };
}

async function readEvents(path: string): Promise<Array<{ event: string; stage: string; message: string }>> {
  return (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}
