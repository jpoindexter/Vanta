import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";

import { buildAppMenuTemplate, DOCS_URL, type MenuDeps } from "./app-menu";
import { CH } from "./channels";

const deps = (platform: NodeJS.Platform = "darwin"): MenuDeps => ({
  appName: "Vanta",
  openExternal: vi.fn(),
  platform,
  reload: vi.fn(),
  sendToRenderer: vi.fn(),
  toggleDevTools: vi.fn(),
  zoom: { in: vi.fn(), out: vi.fn(), reset: vi.fn() }
});

const submenu = (template: MenuItemConstructorOptions[], label: string) =>
  (template.find(entry => entry.label === label)?.submenu ?? []) as MenuItemConstructorOptions[];

describe("application menu", () => {
  it("has Vanta, File, Edit, View, Window and Help on macOS, and no app menu elsewhere", () => {
    expect(buildAppMenuTemplate(deps("darwin")).map(entry => entry.label)).toEqual(["Vanta", "File", "Edit", "View", "Window", "Help"]);
    expect(buildAppMenuTemplate(deps("linux")).map(entry => entry.label)).toEqual(["File", "Edit", "View", "Window", "Help"]);
  });

  it("names the app in About and offers Quit", () => {
    const items = submenu(buildAppMenuTemplate(deps()), "Vanta");

    expect(items.find(item => item.role === "about")?.label).toBe("About Vanta");
    expect(items.some(item => item.role === "quit")).toBe(true);
  });

  it("asks the renderer to open a folder or close the tab, with no accelerator so the rebindable keybinds keep working", () => {
    const d = deps();
    const file = submenu(buildAppMenuTemplate(d), "File");
    const open = file.find(item => item.label === "Open Folder…");
    const close = file.find(item => item.label === "Close");

    (open?.click as () => void)();
    (close?.click as () => void)();

    expect(d.sendToRenderer).toHaveBeenNthCalledWith(1, CH.openFolderRequested);
    expect(d.sendToRenderer).toHaveBeenNthCalledWith(2, CH.closePreviewRequested);
    expect(open?.accelerator).toBeUndefined();
    expect(close?.accelerator).toBeUndefined();
  });

  it("has the standard edit roles so copy and paste work in the page", () => {
    const roles = submenu(buildAppMenuTemplate(deps()), "Edit").map(item => item.role);

    expect(roles).toEqual(expect.arrayContaining(["undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll"]));
  });

  it("wires the zoom items to the zoom controller, with both Plus chords", () => {
    const d = deps();
    const view = submenu(buildAppMenuTemplate(d), "View");
    const byAccel = (accelerator: string) => view.find(item => item.accelerator === accelerator);

    (byAccel("CommandOrControl+0")?.click as () => void)();
    (byAccel("CommandOrControl+Plus")?.click as () => void)();
    (byAccel("CommandOrControl+=")?.click as () => void)();
    (byAccel("CommandOrControl+-")?.click as () => void)();

    expect(d.zoom.reset).toHaveBeenCalledTimes(1);
    expect(d.zoom.in).toHaveBeenCalledTimes(2);
    expect(d.zoom.out).toHaveBeenCalledTimes(1);
    expect(byAccel("CommandOrControl+=")?.visible).toBe(false);
  });

  it("toggles developer tools and reloads the window the menu was used in", () => {
    const d = deps();
    const view = submenu(buildAppMenuTemplate(d), "View");
    const window = { id: 1 };

    (view.find(item => item.label === "Toggle Developer Tools")?.click as (i: unknown, w: unknown) => void)({}, window);
    (view.find(item => item.label === "Reload")?.click as (i: unknown, w: unknown) => void)({}, window);

    expect(d.toggleDevTools).toHaveBeenCalledWith(window);
    expect(d.reload).toHaveBeenCalledWith(window);
  });

  it("opens the docs through the external opener, never a raw URL of its own", () => {
    const d = deps();

    (submenu(buildAppMenuTemplate(d), "Help")[0]?.click as () => void)();

    expect(d.openExternal).toHaveBeenCalledWith(DOCS_URL);
    expect(DOCS_URL.startsWith("https://")).toBe(true);
  });
});
