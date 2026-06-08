import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRegistry } from "./index.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { shellCmdTool } from "./shell-cmd.js";
import type { ToolContext } from "./types.js";

let root: string;

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    root,
    safety: {} as ToolContext["safety"],
    requestApproval: async () => true,
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("registry", () => {
  it("registers all tools", () => {
    const r = buildRegistry();
    const names = r.schemas().map((s) => s.name).sort();
    expect(names).toEqual([
      "bg_list",
      "bg_status",
      "brain",
      "browser_extract",
      "browser_navigate",
      "calendar_create",
      "calendar_read",
      "calendar_update",
      "clarify",
      "compare_vision",
      "compose_workflow",
      "delegate",
      "describe_image",
      "drive_create",
      "drive_read",
      "drive_update",
      "git_branch",
      "git_checkout",
      "git_commit",
      "git_diff",
      "git_push",
      "git_status",
      "gmail_draft",
      "gmail_read",
      "gmail_search",
      "gmail_send",
      "graph_query",
      "inspect_state",
      "look_at_camera",
      "look_at_screen",
      "lsp_definition",
      "lsp_diagnostics",
      "mount_mcp",
      "read_file",
      "recall",
      "ref_ingest",
      "ref_list",
      "ref_search",
      "roadmap_add",
      "roadmap_move",
      "run_code",
      "screenshot",
      "shell_cmd",
      "speak",
      "swarm",
      "todo",
      "tool_search",
      "transcribe",
      "watch_video",
      "web_fetch",
      "web_search",
      "write_file",
      "write_skill",
    ]);
  });

  it("excludes named tools when given an exclude list", () => {
    const r = buildRegistry({ exclude: ["delegate"] });
    const names = r.schemas().map((s) => s.name);
    expect(names).not.toContain("delegate");
  });
});

describe("read_file", () => {
  it("reads a file inside scope", async () => {
    await writeFile(join(root, "hello.txt"), "world");
    const res = await readFileTool.execute({ path: "hello.txt" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toBe("world");
  });

  it("reads a file from a configured readable zone outside the project", async () => {
    const zone = await mkdtemp(join(tmpdir(), "vanta-rzone-"));
    const prev = process.env.VANTA_READABLE_DIRS;
    process.env.VANTA_READABLE_DIRS = zone;
    try {
      const target = join(zone, "skill.md");
      await writeFile(target, "# Sibling skill");
      const res = await readFileTool.execute({ path: target }, ctx());
      expect(res.ok).toBe(true);
      expect(res.output).toBe("# Sibling skill");
    } finally {
      if (prev === undefined) delete process.env.VANTA_READABLE_DIRS;
      else process.env.VANTA_READABLE_DIRS = prev;
      await rm(zone, { recursive: true, force: true });
    }
  });

  it("refuses a path outside the project and outside every readable zone", async () => {
    const prev = process.env.VANTA_READABLE_DIRS;
    process.env.VANTA_READABLE_DIRS = "/some/allowed/zone";
    try {
      const res = await readFileTool.execute({ path: "/etc/hosts" }, ctx());
      expect(res.ok).toBe(false);
      expect(res.output).toContain("not in a readable zone");
    } finally {
      if (prev === undefined) delete process.env.VANTA_READABLE_DIRS;
      else process.env.VANTA_READABLE_DIRS = prev;
    }
  });
});

describe("write_file", () => {
  it("writes a new file without approval", async () => {
    const res = await writeFileTool.execute(
      { path: "new.txt", content: "data" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(await readFile(join(root, "new.txt"), "utf8")).toBe("data");
  });

  it("ACTION-PROOF: reports a re-read verification readout after writing", async () => {
    const res = await writeFileTool.execute(
      { path: "proof.txt", content: "line1\nline2\nline3" },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("verified");
    expect(res.output).toContain("bytes on disk");
  });

  it("CODE-SIZE-GATE in-loop: flags an oversized TS write in the tool result (still writes)", async () => {
    const tooLong = `function f(a:number,b:number,c:number,d:number,e:number){return a+b+c+d+e;}\n`;
    const res = await writeFileTool.execute({ path: "big.ts", content: tooLong }, ctx());
    expect(res.ok).toBe(true); // the write still succeeds
    expect(res.output).toContain("size gate");
    expect(res.output).toContain("params");
  });

  it("CODE-SIZE-GATE in-loop: a clean TS write gets no size note; non-TS is exempt", async () => {
    const clean = await writeFileTool.execute({ path: "ok.ts", content: "export const x = 1;\n" }, ctx());
    expect(clean.output).not.toContain("size gate");
    const txt = await writeFileTool.execute({ path: "notes.txt", content: "a".repeat(5000) }, ctx());
    expect(txt.output).not.toContain("size gate");
  });

  it("requires approval to overwrite, and respects denial", async () => {
    await writeFile(join(root, "exists.txt"), "original");
    const res = await writeFileTool.execute(
      { path: "exists.txt", content: "changed" },
      ctx({ requestApproval: async () => false }),
    );
    expect(res.ok).toBe(false);
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("original");
  });

  it("overwrites when approved", async () => {
    await writeFile(join(root, "exists.txt"), "original");
    const res = await writeFileTool.execute(
      { path: "exists.txt", content: "changed" },
      ctx({ requestApproval: async () => true }),
    );
    expect(res.ok).toBe(true);
    expect(await readFile(join(root, "exists.txt"), "utf8")).toBe("changed");
  });

  it("writes outside the project into a configured writable zone", async () => {
    const zone = await mkdtemp(join(tmpdir(), "vanta-zone-"));
    const prev = process.env.VANTA_WRITABLE_DIRS;
    process.env.VANTA_WRITABLE_DIRS = zone;
    try {
      const target = join(zone, "report.html");
      const res = await writeFileTool.execute({ path: target, content: "<h1>hi</h1>" }, ctx());
      expect(res.ok).toBe(true);
      expect(await readFile(target, "utf8")).toBe("<h1>hi</h1>");
    } finally {
      if (prev === undefined) delete process.env.VANTA_WRITABLE_DIRS;
      else process.env.VANTA_WRITABLE_DIRS = prev;
      await rm(zone, { recursive: true, force: true });
    }
  });

  it("refuses a path outside the project and outside every writable zone", async () => {
    const outside = await mkdtemp(join(tmpdir(), "vanta-outside-"));
    const prev = process.env.VANTA_WRITABLE_DIRS;
    process.env.VANTA_WRITABLE_DIRS = "/some/allowed/zone";
    try {
      const res = await writeFileTool.execute(
        { path: join(outside, "x.txt"), content: "nope" },
        ctx(),
      );
      expect(res.ok).toBe(false);
      expect(res.output).toContain("not in a writable zone");
    } finally {
      if (prev === undefined) delete process.env.VANTA_WRITABLE_DIRS;
      else process.env.VANTA_WRITABLE_DIRS = prev;
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("shell_cmd", () => {
  it("runs a command and returns output", async () => {
    const res = await shellCmdTool.execute({ command: "echo hi" }, ctx());
    expect(res.ok).toBe(true);
    expect(res.output).toContain("hi");
  });

  it("refuses a destructive command locally", async () => {
    const res = await shellCmdTool.execute({ command: "rm -rf /" }, ctx());
    expect(res.ok).toBe(false);
    expect(res.output).toContain("destructive");
  });
});
