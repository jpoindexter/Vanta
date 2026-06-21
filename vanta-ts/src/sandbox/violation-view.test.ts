import { describe, expect, it } from "vitest";
import {
  formatSandboxViolation,
  parseSandboxViolation,
  violationHint,
  type SandboxViolation,
} from "./violation-view.js";

describe("parseSandboxViolation", () => {
  it("parses a macOS Seatbelt file-write deny into kind + target + rule", () => {
    const text =
      "Sandbox: node(123) deny(1) file-write-create /Users/x/secrets/out.txt";
    const v = parseSandboxViolation(text);
    expect(v).toEqual({
      kind: "file-write",
      target: "/Users/x/secrets/out.txt",
      rule: "file-write-create",
    });
  });

  it("parses a file-read deny into kind file-read", () => {
    const v = parseSandboxViolation("deny(1) file-read-data /etc/shadow");
    expect(v?.kind).toBe("file-read");
    expect(v?.target).toBe("/etc/shadow");
    expect(v?.rule).toBe("file-read-data");
  });

  it("parses a network deny (Seatbelt network-outbound) into kind network", () => {
    const v = parseSandboxViolation("deny(1) network-outbound 93.184.216.34:443");
    expect(v?.kind).toBe("network");
    expect(v?.rule).toBe("network-outbound");
  });

  it("parses a process-exec deny into kind exec", () => {
    const v = parseSandboxViolation("Sandbox: sh(9) deny(1) process-exec /bin/curl");
    expect(v?.kind).toBe("exec");
    expect(v?.target).toBe("/bin/curl");
  });

  it("recognizes a Linux network-unreachable signal as a network violation", () => {
    const v = parseSandboxViolation("curl: (7) Network is unreachable");
    expect(v?.kind).toBe("network");
    expect(v?.rule).toBe("network-outbound");
  });

  it("recognizes a bwrap permission-denied signal (unknown kind)", () => {
    const v = parseSandboxViolation("bwrap: Can't create file at /etc/x: Permission denied");
    expect(v?.kind).toBe("unknown");
    expect(v?.rule).toBe("permission-denied");
  });

  it("returns null for a non-sandbox error (renders plainly)", () => {
    expect(parseSandboxViolation("TypeError: x is not a function")).toBeNull();
    expect(parseSandboxViolation("ENOENT: no such file or directory, open 'a.txt'")).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(parseSandboxViolation("")).toBeNull();
    // @ts-expect-error — guarding the LLM/runtime boundary
    expect(parseSandboxViolation(undefined)).toBeNull();
  });
});

describe("violationHint", () => {
  it("a file-write deny gets the writable-dirs hint", () => {
    const hint = violationHint({ kind: "file-write", target: "/Users/x/out.txt" });
    expect(hint).toContain("VANTA_WRITABLE_DIRS");
  });

  it("a file-read deny gets the readable-dirs hint", () => {
    expect(violationHint({ kind: "file-read" })).toContain("VANTA_READABLE_DIRS");
  });

  it("a network deny gets the network opt-in hint", () => {
    expect(violationHint({ kind: "network" })).toContain("VANTA_SANDBOX_NET=1");
  });

  it("an exec deny names the unsandboxed escape hatch", () => {
    expect(violationHint({ kind: "exec" })).toContain("VANTA_SANDBOX");
  });

  it("an unknown deny names the global sandbox flag", () => {
    expect(violationHint({ kind: "unknown" })).toContain("VANTA_SANDBOX");
  });
});

describe("formatSandboxViolation", () => {
  it("names what + rule + hint in the breakdown block", () => {
    const v: SandboxViolation = {
      kind: "file-write",
      target: "/Users/x/secrets/out.txt",
      rule: "file-write-create",
    };
    const block = formatSandboxViolation(v);
    expect(block).toContain("⛔");
    expect(block).toContain("file write"); // what
    expect(block).toContain("/Users/x/secrets/out.txt"); // target
    expect(block).toContain("file-write-create"); // rule
    expect(block).toContain("VANTA_WRITABLE_DIRS"); // hint
  });

  it("a network breakdown names the net opt-in", () => {
    const block = formatSandboxViolation({ kind: "network", rule: "network-outbound" });
    expect(block).toContain("network access");
    expect(block).toContain("VANTA_SANDBOX_NET=1");
  });

  it("control-strips the target so a crafted path can't inject an escape", () => {
    // Raw ESC (\u001b), BEL (\u0007), DEL (\u007f) embedded in the target path.
    const evil = "/Users/x/\u001b[31m\u0007out\u007f.txt";
    const block = formatSandboxViolation({ kind: "file-write", target: evil, rule: "file-write-create" });
    // No raw C0/DEL/C1 control byte survives into the rendered block.
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(block)).toBe(false);
    // The path still names the file, just escape-free.
    expect(block).toContain("out");
    expect(block).toContain(".txt");
  });

  it("renders without a target when none was parsed", () => {
    const block = formatSandboxViolation({ kind: "exec", rule: "process-exec" });
    expect(block).toContain("process exec");
    expect(block).toContain("process-exec");
  });
});

describe("end-to-end: parse → format", () => {
  it("a sandboxed write deny becomes a full actionable breakdown", () => {
    const raw = "Sandbox: node(42) deny(1) file-write-create /Users/x/proj/../etc/p.txt";
    const v = parseSandboxViolation(raw);
    expect(v).not.toBeNull();
    const block = formatSandboxViolation(v!);
    expect(block).toContain("⛔ Sandbox blocked a file write");
    expect(block).toContain("VANTA_WRITABLE_DIRS");
  });

  it("a non-sandbox error stays null (caller renders it plainly)", () => {
    expect(parseSandboxViolation("error: build failed")).toBeNull();
  });
});
