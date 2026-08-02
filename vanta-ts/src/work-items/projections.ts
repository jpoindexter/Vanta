import type { WorkItem } from "./contract.js";

export type WorkItemProjections<T extends WorkItem = WorkItem> = {
  captured: T[];
  now: T[];
  waiting: T[];
  needsYou: T[];
  done: T[];
};

export function projectWorkItems<T extends WorkItem>(items: readonly T[]): WorkItemProjections<T> {
  return {
    captured: items.filter((item) => item.state === "draft"),
    now: items.filter((item) => item.state === "queued" || item.state === "running"),
    waiting: items.filter((item) => item.state === "waiting"),
    needsYou: items.filter((item) => item.state === "needs human"),
    done: items.filter((item) => item.state === "verified"),
  };
}
