import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it } from "vitest";
import { runPostCompactRestore } from "./post-compact-restore.js";
import { SessionWorkingMemory } from "../memory/working.js";

const ROOT = join(tmpdir(), "vanta-post-compact-restore-test");
const HOME = join(tmpdir(), "vanta-post-compact-restore-home");

async function writeRootFile(path: string, content: string): Promise<void> {
  const abs = join(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function writeSkill(slug: string, body: string): Promise<void> {
  const dir = join(HOME, "skills", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${slug}\ndescription: ${slug} description\n---\n\n${body}`,
    "utf8",
  );
}

describe("runPostCompactRestore", () => {
  beforeEach(async () => {
    await rm(ROOT, { recursive: true, force: true });
    await rm(HOME, { recursive: true, force: true });
    await mkdir(ROOT, { recursive: true });
    await mkdir(HOME, { recursive: true });
  });

  it("returns an empty string when no working set or skills are available", async () => {
    const out = await runPostCompactRestore({
      root: ROOT,
      workingMemory: new SessionWorkingMemory(),
      env: { VANTA_HOME: HOME },
    });

    expect(out).toBe("");
  });

  it("reads recently edited files and trims each file to 5 KB", async () => {
    const wm = new SessionWorkingMemory();
    wm.recordEditedFile("src/big.ts");
    await writeRootFile("src/big.ts", `${"a".repeat(6_000)}TAIL`);

    const out = await runPostCompactRestore({ root: ROOT, workingMemory: wm, env: { VANTA_HOME: HOME } });

    expect(out).toContain("## Recently Edited Files");
    expect(out).toContain("### src/big.ts");
    expect(out).toContain("```ts");
    expect(out).not.toContain("TAIL");
    expect(out).toContain("[trimmed to 5120 bytes");
  });

  it("injects active skill bodies with a 25 KB total skill budget", async () => {
    await writeSkill("tdd", `${"skill body\n".repeat(4000)}END`);

    const out = await runPostCompactRestore({
      root: ROOT,
      workingMemory: new SessionWorkingMemory(),
      env: { VANTA_HOME: HOME },
    });

    expect(out).toContain("## Active Skills");
    expect(out).toContain("### tdd");
    expect(out).toContain("```markdown");
    expect(out).not.toContain("END");
    expect(out).toContain("[skills trimmed to 25600 bytes");
  });

  it("formats files and skills as one markdown system-injection block", async () => {
    const wm = new SessionWorkingMemory();
    wm.recordEditedFile("src/app.ts");
    await writeRootFile("src/app.ts", "export const app = true;\n");
    await writeSkill("focus", "Keep the active file context visible.");

    const out = await runPostCompactRestore({ root: ROOT, workingMemory: wm, env: { VANTA_HOME: HOME } });

    expect(out.startsWith("<!-- vanta-post-compact-restore -->\n")).toBe(true);
    expect(out).toContain("# Post-Compact Restore");
    expect(out).toContain("## Recently Edited Files");
    expect(out).toContain("```ts\nexport const app = true;\n```");
    expect(out).toContain("## Active Skills");
    expect(out).toContain("```markdown\n---\nname: focus");
    expect(out.endsWith("\n<!-- /vanta-post-compact-restore -->")).toBe(true);
  });
});
