import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  looksLikeBackgrounding,
  isLongRunningServer,
  looksLikeListenServer,
  looksLikeServeIntent,
  needsBackground,
} from "./shell-background-detect.js";
import { shellCmdTool } from "./shell-cmd.js";

describe("looksLikeBackgrounding", () => {
  it("flags a real trailing '&' background operator", () => {
    expect(looksLikeBackgrounding("sleep 6 & echo $!")).toBe(true);
    expect(looksLikeBackgrounding("python3 -m http.server 8765 &")).toBe(true);
    expect(looksLikeBackgrounding("node server.js & echo started")).toBe(true);
  });

  it("does NOT flag '&&', redirections, or quoted literals", () => {
    expect(looksLikeBackgrounding("npm run build && npm test")).toBe(false);
    expect(looksLikeBackgrounding("cmd 2>&1")).toBe(false);
    expect(looksLikeBackgrounding("cmd >out.log 2>&1")).toBe(false);
    expect(looksLikeBackgrounding("cmd &>log")).toBe(false);
    expect(looksLikeBackgrounding('echo "tom & jerry"')).toBe(false);
    expect(looksLikeBackgrounding('curl "http://x.test?a=1&b=2"')).toBe(false);
    expect(looksLikeBackgrounding("ls -la")).toBe(false);
  });
});

describe("isLongRunningServer", () => {
  it("flags known never-exiting servers/watchers", () => {
    expect(isLongRunningServer("python3 -m http.server 8765")).toBe(true);
    expect(isLongRunningServer("npm run dev")).toBe(true);
    expect(isLongRunningServer("vite dev --port 3000")).toBe(true);
    expect(isLongRunningServer("npx serve -s build")).toBe(true);
    expect(isLongRunningServer("php -S localhost:8000")).toBe(true);
    expect(isLongRunningServer("tail -f /var/log/app.log")).toBe(true);
  });

  it("does NOT flag short one-shot commands", () => {
    expect(isLongRunningServer("npm run build")).toBe(false);
    expect(isLongRunningServer("python3 analyze.py")).toBe(false);
    expect(isLongRunningServer("ls -la")).toBe(false);
    expect(isLongRunningServer("git status")).toBe(false);
  });
});

describe("looksLikeListenServer", () => {
  it("flags raw netcat/socat port binds", () => {
    expect(looksLikeListenServer("nc -l 8123")).toBe(true);
    expect(looksLikeListenServer("ncat -lk 0.0.0.0 9000")).toBe(true);
    expect(looksLikeListenServer("socat TCP-LISTEN:8000,fork EXEC:/bin/cat")).toBe(true);
  });

  it("does NOT flag one-shot netcat clients or unrelated commands", () => {
    expect(looksLikeListenServer("nc example.com 80")).toBe(false);
    expect(looksLikeListenServer("ls -la")).toBe(false);
    expect(looksLikeListenServer("echo socat")).toBe(false);
  });
});

describe("looksLikeServeIntent", () => {
  it("is true for named dev servers AND raw port binds", () => {
    expect(looksLikeServeIntent("python3 -m http.server 8123")).toBe(true);
    expect(looksLikeServeIntent("npx serve -s build")).toBe(true);
    expect(looksLikeServeIntent("nc -l 8123")).toBe(true);
  });

  it("is false for one-shot commands", () => {
    expect(looksLikeServeIntent("npm run build")).toBe(false);
    expect(looksLikeServeIntent("git status")).toBe(false);
    expect(looksLikeServeIntent("cat index.html")).toBe(false);
  });
});

describe("needsBackground", () => {
  it("is true when either signal fires", () => {
    expect(needsBackground("python3 -m http.server 8765 &")).toBe(true);
    expect(needsBackground("npm run dev")).toBe(true);
    expect(needsBackground("git status")).toBe(false);
  });
});

// Integration: the tool must REFUSE a foreground backgrounded/server command with
// guidance, instead of running it foreground (which blocks ~30s and orphans the
// child). Pre-fix this returned ok:true after the execFile timeout; the refusal is
// immediate. Proves the wedge can't reach runLocal.
describe("shellCmdTool refuses a foreground backgrounded/long-running command", () => {
  const ctx = { root: mkdtempSync(join(tmpdir(), "vanta-bgwedge-")) } as never;

  it("refuses a trailing '&' and points to background:true", async () => {
    const r = await shellCmdTool.execute({ command: "sleep 30 & echo hi" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/background:\s*true/);
  });

  it("refuses a known server command", async () => {
    const r = await shellCmdTool.execute({ command: "python3 -m http.server 8765" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/background:\s*true/);
  });

  it("still runs a normal one-shot command", async () => {
    const r = await shellCmdTool.execute({ command: "echo hello-vanta" }, ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("hello-vanta");
  });
});
