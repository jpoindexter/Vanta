import { describe, expect, it } from "vitest";
import type { SessionMeta } from "./store.js";
import {
  withProjectId,
  listAllProjectsSessions,
  filterByProject,
  filterCrossProject,
} from "./cross-project.js";

const PROJECT_A = "aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbbbbbb";

function meta(id: string, projectId?: string): SessionMeta {
  return { id, title: id, started: "2026-06-20T00:00:00.000Z", updated: "2026-06-20T00:00:00.000Z", turns: 1, projectId };
}

describe("cross-project session helpers", () => {
  describe("withProjectId", () => {
    it("resolves projectId and a matching label", () => {
      const annotated = withProjectId(meta("s1", PROJECT_A));
      expect(annotated.projectId).toBe(PROJECT_A);
      expect(annotated.projectLabel).toBe(PROJECT_A);
    });

    it("tolerates a session with no projectId (null + unknown label)", () => {
      const annotated = withProjectId(meta("s1"));
      expect(annotated.projectId).toBeNull();
      expect(annotated.projectLabel).toBe("(unknown project)");
    });

    it("preserves the original session fields", () => {
      const annotated = withProjectId(meta("s1", PROJECT_A));
      expect(annotated.id).toBe("s1");
      expect(annotated.turns).toBe(1);
    });
  });

  describe("listAllProjectsSessions", () => {
    it("annotates every session with projectId + label", () => {
      const all = listAllProjectsSessions([meta("s1", PROJECT_A), meta("s2", PROJECT_B), meta("s3")]);
      expect(all.map((s) => s.projectId)).toEqual([PROJECT_A, PROJECT_B, null]);
      expect(all.map((s) => s.projectLabel)).toEqual([PROJECT_A, PROJECT_B, "(unknown project)"]);
    });

    it("returns [] for an empty listing", () => {
      expect(listAllProjectsSessions([])).toEqual([]);
    });
  });

  describe("filterByProject", () => {
    it("returns only sessions from that project", () => {
      const list = [meta("s1", PROJECT_A), meta("s2", PROJECT_B), meta("s3", PROJECT_A)];
      expect(filterByProject(list, PROJECT_A).map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("never matches a project-less session against a concrete id", () => {
      expect(filterByProject([meta("s1")], PROJECT_A)).toEqual([]);
    });
  });

  describe("filterCrossProject", () => {
    it("returns only sessions from OTHER projects", () => {
      const list = [meta("s1", PROJECT_A), meta("s2", PROJECT_B), meta("s3", PROJECT_A)];
      expect(filterCrossProject(list, PROJECT_A).map((s) => s.id)).toEqual(["s2"]);
    });

    it("includes project-less sessions (origin unknown ≠ current project)", () => {
      const list = [meta("s1", PROJECT_A), meta("s2")];
      expect(filterCrossProject(list, PROJECT_A).map((s) => s.id)).toEqual(["s2"]);
    });

    it("is the complement of filterByProject over the same listing", () => {
      const list = [meta("s1", PROJECT_A), meta("s2", PROJECT_B), meta("s3")];
      const same = filterByProject(list, PROJECT_A).map((s) => s.id);
      const cross = filterCrossProject(list, PROJECT_A).map((s) => s.id);
      expect([...same, ...cross].sort()).toEqual(["s1", "s2", "s3"]);
      expect(same.filter((id) => cross.includes(id))).toEqual([]);
    });
  });
});
