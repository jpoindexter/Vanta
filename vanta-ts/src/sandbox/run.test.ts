import { describe, it, expect, afterEach } from "vitest";
import { realpathSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { buildSeatbeltProfile } from "./profile.js";
import { resolve } from "node:path";
import { isSandboxError, maybeSandbox } from "./run.js";

const ROOT = "/Users/x/proj";

function envWith(over: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...over };
}

const origPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process, "platform", { value: origPlatform, configurable: true });
});

describe("maybeSandbox — default OFF (byte-identical)", () => {
  it("returns the base cmd/args UNCHANGED when VANTA_SANDBOX is unset", async () => {
    const r = await maybeSandbox({ env: envWith({}), root: ROOT, baseCmd: "sh", baseArgs: ["-c", "echo hi"] });
    expect(isSandboxError(r)).toBe(false);
    expect(r).toMatchObject({ cmd: "sh", args: ["-c", "echo hi"] });
    expect("cleanup" in r).toBe(false);
  });

  it("returns base unchanged when VANTA_SANDBOX is anything but '1'", async () => {
    const r = await maybeSandbox({ env: envWith({ VANTA_SANDBOX: "0" }), root: ROOT, baseCmd: "node", baseArgs: ["a.mjs"] });
    expect(r).toMatchObject({ cmd: "node", args: ["a.mjs"] });
  });
});

describe("maybeSandbox — error sentinel when no backend", () => {
  it("returns {error} when VANTA_SANDBOX=1 but the platform has no backend", async () => {
    setPlatform("win32");
    const r = await maybeSandbox({ env: envWith({ VANTA_SANDBOX: "1" }), root: ROOT, baseCmd: "sh", baseArgs: ["-c", "x"] });
    expect(isSandboxError(r)).toBe(true);
    if (isSandboxError(r)) {
      expect(r.error).toContain("VANTA_SANDBOX=1");
      expect(r.error).toContain("Refusing to run");
    }
  });
});

describe("maybeSandbox — seatbelt (darwin)", () => {
  it("wraps in sandbox-exec with a temp profile + cleanup", async () => {
    setPlatform("darwin");
    const r = await maybeSandbox({ env: envWith({ VANTA_SANDBOX: "1" }), root: ROOT, baseCmd: "sh", baseArgs: ["-c", "echo hi"] });
    expect(isSandboxError(r)).toBe(false);
    if (isSandboxError(r)) return;
    expect(r.cmd).toBe("sandbox-exec");
    expect(r.args[0]).toBe("-f");
    const profilePath = r.args[1];
    if (profilePath === undefined) throw new Error("missing profile path");
    expect(r.args.slice(2)).toEqual(["sh", "-c", "echo hi"]);

    const profile = await readFile(profilePath, "utf8");
    expect(profile).toContain("(deny default)");
    // tmpdir() MUST be writable so run_code's mkdtemp temp dir works under sandbox.
    expect(profile).toContain(`(allow file-write* (subpath "${realpathSync(tmpdir())}"))`);
    // root is writable
    expect(profile).toContain(`(allow file-write* (subpath "${resolve(ROOT)}"))`);

    await r.cleanup?.();
    await expect(stat(profilePath)).rejects.toThrow();
  });

  it("respects VANTA_SANDBOX_NET=1 (no network deny in the profile)", async () => {
    setPlatform("darwin");
    const r = await maybeSandbox({ env: envWith({ VANTA_SANDBOX: "1", VANTA_SANDBOX_NET: "1" }), root: ROOT, baseCmd: "sh", baseArgs: ["-c", "x"] });
    if (isSandboxError(r)) throw new Error("unexpected sentinel");
    const netProfilePath = r.args[1];
    if (netProfilePath === undefined) throw new Error("missing profile path");
    const profile = await readFile(netProfilePath, "utf8");
    expect(profile).not.toContain("(deny network*)");
    await r.cleanup?.();
  });
});

describe("maybeSandbox — bwrap (linux)", () => {
  it("wraps in bwrap with --unshare-net and no temp profile/cleanup", async () => {
    setPlatform("linux");
    const r = await maybeSandbox({ env: envWith({ VANTA_SANDBOX: "1" }), root: ROOT, baseCmd: "python3", baseArgs: ["main.py"] });
    if (isSandboxError(r)) throw new Error("unexpected sentinel");
    expect(r.cmd).toBe("bwrap");
    expect(r.args).toContain("--unshare-net");
    expect(r.args).toContain("--die-with-parent");
    // tmpfs masks /tmp; the real command trails after the `--` separator.
    expect(r.args).toContain("--tmpfs");
    expect(r.args.slice(-2)).toEqual(["python3", "main.py"]);
    expect(r.cleanup).toBeUndefined();
  });
});

// VANTA-SANDBOX-TSX-SELFCALL — a self-CLI call under the OS sandbox must work. The `tsx`
// CLI starts an IPC server (listens on a $TMPDIR/*.pipe unix socket) that seatbelt denies
// (EPERM; even `(allow network*)` doesn't cover a unix-socket listen under deny-default), so
// the launcher runs `node --import tsx` (the loader, no IPC server). This locks that in.
describe("tsx self-call under the real seatbelt sandbox (darwin)", () => {
  const canRun = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec") && existsSync("node_modules/tsx");
  it.skipIf(!canRun)("node --import tsx runs a .ts under the profile; the tsx CLI EPERMs", () => {
    const dir = mkdtempSync(resolve(realpathSync(tmpdir()), "sb-tsx-"));
    const script = resolve(dir, "t.ts");
    writeFileSync(script, 'console.log("RAN:" + (40 + 2 as number));\n');
    const profilePath = resolve(dir, "p.sb");
    writeFileSync(profilePath, buildSeatbeltProfile(process.cwd(), [], { net: false }));
    const sx = (cmd: string, args: string[]) => execFileSync("sandbox-exec", ["-f", profilePath, cmd, ...args], {
      encoding: "utf8",
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    // the fix: the loader has no IPC server → runs sandboxed
    expect(sx("node", ["--import", "tsx", script]).trim()).toBe("RAN:42");
    // the bug, documented: the tsx CLI's IPC server is denied → EPERM
    expect(() => sx("node_modules/.bin/tsx", [script])).toThrow(/EPERM|listen/);
  });
});

// The system /tmp (/private/tmp) must be writable under the default-on shell sandbox —
// it's the canonical scratch path tools/agents write to (was denied → EPERM). Regression.
describe("sandbox permits the system /tmp (darwin)", () => {
  const canRun = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
  it.skipIf(!canRun)("a `> /tmp/…` write succeeds under VANTA_SANDBOX=1", async () => {
    const sb = await maybeSandbox({ env: { ...process.env, VANTA_SANDBOX: "1" }, root: process.cwd(), baseCmd: "sh", baseArgs: ["-c", "echo ok > /tmp/vanta-sb-regress.txt"] });
    if (isSandboxError(sb)) return; // no backend on this box → skip
    expect(() => execFileSync(sb.cmd, sb.args, { encoding: "utf8" })).not.toThrow();
    await sb.cleanup?.();
    rmSync("/tmp/vanta-sb-regress.txt", { force: true });
  });
});
