import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { DesktopAsset } from "./assets.js";

function expectServed(asset: DesktopAsset): asserts asset is Exclude<DesktopAsset, { kind: "missing" }> {
  expect(asset.kind).not.toBe("missing");
  if (asset.kind === "missing") throw new Error("asset missing");
}

describe("desktop app assets", () => {
  it("serves the Vite-built desktop app when dist/index.html exists", async () => {
    await expect(access(join(process.cwd(), "src", "desktop", "assets.ts"))).resolves.toBeUndefined();
    const { resolveDesktopAsset } = await import("./assets.js");
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-assets-"));
    const dist = join(root, "vanta-ts", "desktop-app", "dist");
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, "index.html"), "<div id=\"root\"></div>", "utf8");

    const asset = await resolveDesktopAsset(root, "/");
    expect(asset.kind).toBe("file");
    expectServed(asset);
    expect(asset.contentType).toBe("text/html; charset=utf-8");
    expect(asset.body.toString("utf8")).toContain("root");
  });

  it("keeps the legacy static page as fallback when the app has not been built", async () => {
    await expect(access(join(process.cwd(), "src", "desktop", "assets.ts"))).resolves.toBeUndefined();
    const { resolveDesktopAsset } = await import("./assets.js");
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-assets-"));
    const asset = await resolveDesktopAsset(root, "/");
    expect(asset.kind).toBe("fallback");
    expectServed(asset);
    expect(asset.contentType).toBe("text/html; charset=utf-8");
    expect(asset.body.toString("utf8")).toContain("Vanta Desktop");
  });

  it("serves hashed built assets from desktop-app/dist", async () => {
    await expect(access(join(process.cwd(), "src", "desktop", "assets.ts"))).resolves.toBeUndefined();
    const { resolveDesktopAsset } = await import("./assets.js");
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-assets-"));
    const assets = join(root, "vanta-ts", "desktop-app", "dist", "assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "main.js"), "console.log('desktop')", "utf8");

    const asset = await resolveDesktopAsset(root, "/assets/main.js");
    expect(asset.kind).toBe("file");
    expectServed(asset);
    expect(asset.contentType).toBe("text/javascript; charset=utf-8");
    expect(asset.body.toString("utf8")).toContain("desktop");
  });

  it("serves the same app shell at the companion route", async () => {
    const { resolveDesktopAsset } = await import("./assets.js");
    const asset = await resolveDesktopAsset(join(process.cwd(), ".."), "/companion");
    expect(asset.kind).not.toBe("missing");
    if (asset.kind !== "missing") expect(asset.body.toString("utf8")).toContain("id=\"root\"");
  });
});
