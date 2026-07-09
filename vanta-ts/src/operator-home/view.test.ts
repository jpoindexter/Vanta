import { describe, expect, it } from "vitest";
import { formatOperatorHome, type HomeSnapshot } from "./view.js";

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
