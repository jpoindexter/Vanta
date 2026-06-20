import { describe, it, expect } from "vitest";
import { parseDeepLink, resolveLaunchCommand } from "./parse.js";

describe("parseDeepLink", () => {
  it("parses prompt + cwd + repo from a valid vanta://run link", () => {
    const res = parseDeepLink("vanta://run?prompt=hello&cwd=/tmp/proj&repo=/repos/x");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({ prompt: "hello", cwd: "/tmp/proj", repo: "/repos/x" });
  });

  it("URL-decodes an encoded prompt", () => {
    const res = parseDeepLink("vanta://run?prompt=fix%20the%20bug%20in%20auth.ts");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.prompt).toBe("fix the bug in auth.ts");
  });

  it("accepts relative path shapes for cwd", () => {
    const res = parseDeepLink("vanta://run?cwd=./sub/dir");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.cwd).toBe("./sub/dir");
  });

  it("rejects a control character in the prompt", () => {
    // %0A is a newline (\x0A) — a control char an attacker could smuggle in.
    const res = parseDeepLink("vanta://run?prompt=line1%0Aline2");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("control characters");
  });

  it("rejects a NUL byte in the prompt", () => {
    const res = parseDeepLink("vanta://run?prompt=evil%00inject");
    expect(res.ok).toBe(false);
  });

  it("rejects a control character in cwd", () => {
    const res = parseDeepLink("vanta://run?cwd=%09/tmp");
    expect(res.ok).toBe(false);
  });

  it("rejects a scheme-bearing (non-path) cwd", () => {
    const res = parseDeepLink("vanta://run?cwd=file:///etc/passwd");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("not a valid path");
  });

  it("rejects an empty cwd", () => {
    const res = parseDeepLink("vanta://run?cwd=%20%20");
    expect(res.ok).toBe(false);
  });

  it("rejects a wrong scheme", () => {
    const res = parseDeepLink("https://run?prompt=hi");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("unsupported scheme");
  });

  it("rejects a wrong action", () => {
    const res = parseDeepLink("vanta://delete?prompt=hi");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("unsupported action");
  });

  it("rejects malformed percent-encoding", () => {
    const res = parseDeepLink("vanta://run?prompt=%zz");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("malformed encoding");
  });

  it("rejects a non-URL input", () => {
    const res = parseDeepLink("not a url at all");
    expect(res.ok).toBe(false);
  });

  it("returns an empty object for a vanta://run link with no params", () => {
    const res = parseDeepLink("vanta://run");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({});
  });
});

describe("resolveLaunchCommand", () => {
  it("returns an argv array (no shell string) for a valid link", () => {
    const cmd = resolveLaunchCommand({ prompt: "do the thing", cwd: "/tmp/proj" }, {});
    expect(cmd.cmd).toBe("vanta");
    expect(Array.isArray(cmd.args)).toBe(true);
    expect(cmd.args).toEqual(["run", "do the thing"]);
    expect(cmd.cwd).toBe("/tmp/proj");
  });

  it("does not flatten the prompt into a shell string (injection-safe)", () => {
    // A prompt with shell metacharacters stays a single, separate argv element.
    const cmd = resolveLaunchCommand({ prompt: 'a"; rm -rf / #' }, {});
    expect(cmd.args).toEqual(["run", 'a"; rm -rf / #']);
    expect(cmd.args.join(" ")).not.toBe(cmd.cmd); // it's never a single shell line
  });

  it("prefers cwd over repo for the working directory", () => {
    const cmd = resolveLaunchCommand({ prompt: "x", cwd: "/a", repo: "/b" }, {});
    expect(cmd.cwd).toBe("/a");
  });

  it("falls back to repo when cwd is absent", () => {
    const cmd = resolveLaunchCommand({ prompt: "x", repo: "/b" }, {});
    expect(cmd.cwd).toBe("/b");
  });

  it("omits run args when there is no prompt", () => {
    const cmd = resolveLaunchCommand({ cwd: "/a" }, {});
    expect(cmd.args).toEqual([]);
    expect(cmd.cwd).toBe("/a");
  });

  it("honors VANTA_BIN override for the launch binary", () => {
    const cmd = resolveLaunchCommand({ prompt: "x" }, { VANTA_BIN: "./run.sh" });
    expect(cmd.cmd).toBe("./run.sh");
  });
});
