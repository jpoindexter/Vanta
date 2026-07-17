import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopServer } from "./server.js";

describe("desktop file context API", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "vanta-file-context-api-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("returns safe project files through both compatible endpoints", async () => {
    await mkdir(join(root, "src"), { recursive: true });
    await Promise.all([
      writeFile(join(root, "src", "app.ts"), "export {};\n"),
      writeFile(join(root, ".env"), "TOKEN=private\n"),
      writeFile(join(root, "ignored.log"), "noise\n"),
      writeFile(join(root, ".gitignore"), "ignored.log\n"),
    ]);
    const server = createDesktopServer(root);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("desktop server did not bind");
    try {
      const base = `http://127.0.0.1:${address.port}`;
      const files = await (await fetch(`${base}/api/files`)).json() as string[];
      const context = await (await fetch(`${base}/api/file-context`)).json() as { files: string[]; recent: string[] };
      expect(files).toContain("src/app.ts");
      expect(context.files).toContain("src/app.ts");
      expect(context.recent).toContain("src/app.ts");
      expect([...files, ...context.files]).not.toContain(".env");
      expect([...files, ...context.files]).not.toContain("ignored.log");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
