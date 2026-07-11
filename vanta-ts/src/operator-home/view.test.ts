import { describe, expect, it } from "vitest";
import { automationSection, formatOperatorHome, type HomeSnapshot } from "./view.js";
import type { AutomationRecord } from "../automation-blueprints/store.js";

describe("formatOperatorHome", () => {
  it("renders the required launch-pad sections with next actions", () => {
    const snapshot: HomeSnapshot = {
      sections: [
        { name: "Workflows", status: "ok", detail: "8 run, 0 try, 0 setup", next: "/what-can-i-do" },
        { name: "Channels", status: "setup", detail: "5 ready, 0 degraded, 4 setup", next: "/reach" },
        { name: "Skills", status: "ok", detail: "12 installed skill(s)", next: "/skills" },
        { name: "Agents/Tasks", status: "watch", detail: "1 task(s), 2 background shell task(s) running", next: "/tasks next" },
        { name: "Memory", status: "ok", detail: "3 goal memory file(s), 2048 bytes", next: "/memory <note>" },
        { name: "Watchers", status: "setup", detail: "0 active scheduled watcher(s)", next: "vanta schedule" },
        { name: "Setup", status: "setup", detail: "2 capability gap(s)", next: "/health" },
      ],
    };

    const out = formatOperatorHome(snapshot);
    expect(out).toContain("Operator Home");
    for (const section of snapshot.sections) {
      expect(out).toContain(`[${section.status}] ${section.name}`);
      expect(out).toContain(`Next: ${section.next}`);
    }
  });
});

describe("automationSection", () => {
  it("shows active and paused blueprints with their control path", () => {
    const records = [
      { id: "daily-brief-1", status: "active", kind: "schedule", blueprint: "daily-brief" },
      { id: "github-pr-review-review-pr", status: "paused", kind: "webhook", blueprint: "github-pr-review" },
    ] as AutomationRecord[];
    expect(automationSection(records)).toEqual({
      name: "Automations", status: "watch", detail: "2 automation(s), 1 active, 1 paused",
      next: "`vanta automation list` (pause, resume, test, receipts)",
    });
  });
});
