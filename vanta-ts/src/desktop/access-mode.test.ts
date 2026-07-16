import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accessModeForPermission,
  loadDesktopAccessMode,
  permissionModeForAccess,
  saveDesktopAccessMode,
} from "./access-mode.js";

describe("desktop access mode", () => {
  it("maps the operator labels to runtime permission modes", () => {
    expect(permissionModeForAccess("ask")).toBe("default");
    expect(permissionModeForAccess("approve")).toBe("acceptEdits");
    expect(permissionModeForAccess("full")).toBe("fullAccess");
    expect(accessModeForPermission("default")).toBe("ask");
    expect(accessModeForPermission("acceptEdits")).toBe("approve");
    expect(accessModeForPermission("fullAccess")).toBe("full");
  });

  it("persists project scope without erasing other local settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-desktop-access-"));
    const settingsPath = join(root, ".vanta", "settings.local.json");
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ ui: { theme: "ghost" } }));

    await saveDesktopAccessMode(root, "full");

    expect(await loadDesktopAccessMode(root, {})).toBe("full");
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toMatchObject({
      ui: { theme: "ghost" },
      desktop: { accessMode: "full" },
    });
  });
});
