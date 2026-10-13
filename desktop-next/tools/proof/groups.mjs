// The order the proof runs in. Each group owns the rows it records; later groups may overwrite an earlier
// row when they can prove more (a seeded state turns a NOT-RUN into a PASS).
import * as chrome from "./rows-chrome.mjs";
import * as right from "./rows-right.mjs";
import * as thread from "./rows-thread.mjs";
import * as win from "./rows-window.mjs";
import { dirtyProject } from "./rows-right.mjs";
import { ensureChat } from "./kit.mjs";

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
  }
];
