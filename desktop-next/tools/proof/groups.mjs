// The order the proof runs in. Each group owns the rows it records; later groups may overwrite an earlier
// row when they can prove more (a seeded state turns a NOT-RUN into a PASS).
import * as chrome from "./rows-chrome.mjs";
import * as composer from "./rows-composer.mjs";
import * as pages from "./rows-pages.mjs";
import * as palette from "./rows-palette.mjs";
import * as profiles from "./rows-profiles.mjs";
import * as right from "./rows-right.mjs";
import * as settings from "./rows-settings.mjs";
import * as seeded from "./rows-seeded.mjs";
import * as thread from "./rows-thread.mjs";
import * as win from "./rows-window.mjs";
import { dirtyProject } from "./rows-right.mjs";
import { ensureChat, freshWindow } from "./kit.mjs";

/** Rows that need an app with no chats: the empty sidebar. */
export const EMPTY_RUN = chrome.emptyState;

export const GROUPS = [
  {
    name: "chrome",
    run: async ({ page }) => {
      await chrome.titlebar(page);
      await chrome.sidebarTop(page);
      await chrome.startChat(page);
      await chrome.sidebarList(page);
      await chrome.filterMenu(page);
      await chrome.listRest(page);
      await chrome.newProjectDialog(page);
      await chrome.footer(page);
      await chrome.bots(page);
      await chrome.statusBar(page);
      await chrome.surfaces(page);
    }
  },
  {
    name: "seeded",
    run: async (ctx) => {
      await ensureChat(ctx.page);
      await seeded.dateAndPinned(ctx.page);
      await seeded.rowMenuRows(ctx);
      await seeded.tabRows(ctx.page);
      await seeded.unreadRows(ctx);
      await seeded.cronAndMore(ctx.page);
      await seeded.folderRows(ctx);
      await seeded.projectRows(ctx);
    }
  },
  {
    name: "right",
    run: async ({ page, app, project }) => {
      await ensureChat(page);
      dirtyProject(project);
      await right.panesOpen(page);
      await right.filesPane(page, app);
      await right.fileActions(page, app, project);
      await right.reviewPane(page, project);
      await right.commitPane(page, project);
      await right.terminalPane(page);
      await right.previewFile(page);
      await right.browserPane(page);
      await right.tabsAndOverlays(page);
      await right.narrow(page, app);
      right.paneRows();
    }
  },
  {
    name: "window",
    run: async (ctx) => {
      await ensureChat(ctx.page);
      await win.menuRows(ctx);
      await win.findRows(ctx);
      await win.hudRows(ctx);
      await win.trayRows(ctx);
      await win.quickEntryRows(ctx);
      await win.linkRows(ctx);
    }
  },
  {
    name: "thread",
    run: async (ctx) => {
      await ensureChat(ctx.page);
      await thread.messageRows(ctx.page);
      await thread.toolAndErrorRows(ctx.page);
      await thread.approvalRows(ctx);
      await thread.focusRouting(ctx);
      await thread.imageRows(ctx);
      await thread.threadStates(ctx.page);
    }
  },
  {
    name: "profiles",
    run: async (ctx) => {
      await profiles.profileRail(ctx);
      await profiles.botsRows(ctx);
    }
  },
  {
    name: "composer",
    run: async (ctx) => {
      await freshWindow(ctx.page);
      await ensureChat(ctx.page);
      await composer.inputRows(ctx.page);
      await composer.attachRows(ctx);
      await composer.pillRows(ctx.page);
      await composer.runRows(ctx.page);
    }
  },
  {
    name: "palette",
    run: async (ctx) => {
      await freshWindow(ctx.page);
      await ensureChat(ctx.page);
      await palette.paletteRows(ctx.page);
      await palette.contextRows(ctx);
    }
  },
  {
    name: "settings",
    run: async (ctx) => {
      await settings.settingsRows(ctx.page);
    }
  },
  {
    name: "pages",
    run: async (ctx) => {
      await freshWindow(ctx.page);
      await ensureChat(ctx.page);
      await pages.capabilityRows(ctx.page);
      await pages.pageRows(ctx);
      await pages.onboardingRows(ctx.page);
    }
  }
];
