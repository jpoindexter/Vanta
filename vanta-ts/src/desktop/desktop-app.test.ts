import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd());

describe("desktop-app package surface", () => {
  it("exposes Vite scripts and runtime dependencies", async () => {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(pkg.scripts?.["desktop:dev"] ?? "").toContain("vite");
    expect(pkg.scripts?.["desktop:build"] ?? "").toContain("vite build");
    expect(pkg.scripts?.["desktop:native"] ?? "").toContain("electron");
    expect(pkg.scripts?.["desktop:native:smoke"] ?? "").toContain("--smoke");
    expect(pkg.dependencies?.["react-dom"]).toBeTruthy();
    expect(pkg.devDependencies?.electron).toBeTruthy();
    expect(pkg.devDependencies?.vite).toBeTruthy();
  });

  it("contains componentized React entry points instead of one giant string", async () => {
    await expect(access(join(root, "desktop-app", "src", "App.tsx"))).resolves.toBeUndefined();
    await expect(access(join(root, "desktop-app", "src", "main.tsx"))).resolves.toBeUndefined();

    const sourceFiles = ["App.tsx", "chat.tsx", "rail.tsx", "overlays.tsx"];
    const app = (await Promise.all(sourceFiles.map((file) => readFile(join(root, "desktop-app", "src", file), "utf8")))).join("\n");
    const main = await readFile(join(root, "desktop-app", "src", "main.tsx"), "utf8");

    await expect(access(join(root, "desktop-app", "electron", "main.mjs"))).resolves.toBeUndefined();
    expect(app).toContain("function AppShell");
    expect(app).toContain("function SessionSidebar");
    expect(app).toContain("function ChatThread");
    expect(app).toContain("function Composer");
    expect(app).toContain("function RightRail");
    expect(app).toContain("function CommandPalette");
    expect(app).toContain("function ModelPicker");
    expect(app).toContain("function ApprovalOverlay");
    expect(app).toContain("function TerminalPanel");
    expect(main).toContain("createRoot");
  });
});
