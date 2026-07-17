import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ReleaseAction, ReleaseObservation, SchemaReleaseTaskDriver } from "./release-proof-task.js";

export function createRepoReleaseDriver(root: string): SchemaReleaseTaskDriver {
  const target = join("work", "schema-release-task.txt");
  const path = join(root, target);
  let calls = 0;
  const observation = async (): Promise<ReleaseObservation> => {
    const value = (await readFile(path, "utf8")).trim();
    return { completed: value === "pending" ? 0 : value === "unexpected" ? 2 : 1, value };
  };
  return {
    kind: "repo",
    target,
    reset: async () => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, "pending\n", "utf8"); },
    observe: observation,
    execute: async (action: ReleaseAction) => {
      calls += 1;
      await writeFile(path, `${action.mode === "unexpected" ? "unexpected" : "done"}\n`, "utf8");
      return observation();
    },
    executionCount: () => calls,
  };
}

type BrowserPage = {
  goto(url: string, options?: { waitUntil?: "domcontentloaded" }): Promise<unknown>;
  locator(selector: string): {
    click(): Promise<void>;
    textContent(): Promise<string | null>;
  };
};

export function createBrowserReleaseDriver(page: BrowserPage, url: string): SchemaReleaseTaskDriver {
  let calls = 0;
  const observation = async (): Promise<ReleaseObservation> => {
    const value = (await page.locator("#status").textContent())?.trim() ?? "missing";
    return { completed: value === "pending" ? 0 : value === "unexpected" ? 2 : 1, value };
  };
  return {
    kind: "browser",
    target: "#status",
    reset: async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); },
    observe: observation,
    execute: async (action: ReleaseAction) => {
      calls += 1;
      await page.locator(action.mode === "unexpected" ? "#unexpected" : "#finish").click();
      return observation();
    },
    executionCount: () => calls,
  };
}
