import { readFileSync,readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe,expect,it } from "vitest";
import { analyzeSource } from "../lint/size.js";
import { handleApproval } from "./handler-approval.js";
import { handleChat,handleStopChat } from "./handler-chat.js";
import { handleSetModel } from "./handler-models.js";
import { handleQueueChat } from "./handler-queue.js";
import { handleRunAction } from "./handler-runs.js";
import { handleBulkSessions } from "./handler-sessions.js";
import * as facade from "./handlers.js";

const directory = fileURLToPath(new URL(".", import.meta.url));
const modules = readdirSync(directory).filter(name => /^handler-.*\.ts$/.test(name) && !name.endsWith(".test.ts"));

describe("Desktop handler module boundaries", () => {
  it("keeps existing handler imports bound to their implementations", () => {
    for (const [name, implementation] of Object.entries({ handleApproval, handleChat, handleStopChat, handleQueueChat, handleSetModel, handleRunAction, handleBulkSessions })) {
      expect(facade[name as keyof typeof facade]).toBe(implementation);
    }
  });

  it("keeps every extracted module and the approval facade within the size gate", () => {
    for (const name of [...modules, "handlers.ts", "approval.ts"]) {
      expect(analyzeSource(name, readFileSync(join(directory, name), "utf8")), name).toEqual([]);
    }
  });

  it("has no runtime cycle between handler modules", () => {
    const dependencies = new Map(modules.map(name => {
      const text = readFileSync(join(directory, name), "utf8");
      const imports = [...text.matchAll(/^import (?!type\b)(.+) from "\.\/(handler-[^"]+)\.js";/gm)]
        .filter(match => !/^\{\s*type [^,}]+(?:,\s*type [^,}]+)*\s*\}$/.test(match[1] ?? ""))
        .map(match => `${match[2]}.ts`);
      return [name, imports];
    }));
    const visit = (name: string, path: string[]): void => {
      expect(path, `cycle through ${name}`).not.toContain(name);
      for (const dependency of dependencies.get(name) ?? []) visit(dependency, [...path, name]);
    };
    for (const name of modules) visit(name, []);
  });
});
