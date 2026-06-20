import { describe, expect, it } from "vitest";
import {
  PLAYBOOK_MIN_OUTCOMES,
  extractPlaybook,
  matchPlaybook,
  playbookId,
  readPlaybooks,
  recordPlaybook,
  writePlaybooks,
  type CompletedOutcome,
  type Playbook,
  type PlaybookStoreFs,
} from "./org-learning.js";

function outcome(taskId: string, taskType: string, steps: string[]): CompletedOutcome {
  return { taskId, taskType, steps };
}

/** Build N outcomes of one taskType with distinct ids. */
function nOutcomes(taskType: string, count: number, steps: string[] = ["a", "b"]): CompletedOutcome[] {
  return Array.from({ length: count }, (_, i) => outcome(`t${i + 1}`, taskType, steps));
}

describe("extractPlaybook — the >=3 threshold", () => {
  it("returns null below the threshold (2 matching outcomes)", () => {
    expect(extractPlaybook("growth", "weekly-report", nOutcomes("weekly-report", 2))).toBeNull();
  });

  it("returns null when zero outcomes match the taskType", () => {
    const other = nOutcomes("onboarding", 5);
    expect(extractPlaybook("growth", "weekly-report", other)).toBeNull();
  });

  it("returns null when matching outcomes are below threshold despite other types", () => {
    const mixed = [...nOutcomes("weekly-report", 2), ...nOutcomes("onboarding", 4)];
    expect(extractPlaybook("growth", "weekly-report", mixed)).toBeNull();
  });

  it("PLAYBOOK_MIN_OUTCOMES is 3 (exact boundary forms a playbook)", () => {
    expect(PLAYBOOK_MIN_OUTCOMES).toBe(3);
    const pb = extractPlaybook("growth", "weekly-report", nOutcomes("weekly-report", 3));
    expect(pb).not.toBeNull();
  });

  it("forms a playbook with steps + fromTaskIds at >=3 outcomes", () => {
    const outcomes = [
      outcome("t1", "weekly-report", ["pull metrics", "draft summary"]),
      outcome("t2", "weekly-report", ["pull metrics", "send email"]),
      outcome("t3", "weekly-report", ["pull metrics", "draft summary", "send email"]),
    ];
    const pb = extractPlaybook("growth", "weekly-report", outcomes);
    expect(pb).toEqual<Playbook>({
      id: playbookId("growth", "weekly-report"),
      departmentId: "growth",
      taskType: "weekly-report",
      // union of all steps, first-seen order preserved, deduped
      steps: ["pull metrics", "draft summary", "send email"],
      fromTaskIds: ["t1", "t2", "t3"],
    });
  });

  it("only counts outcomes of the exact taskType, ignoring others", () => {
    const mixed = [
      ...nOutcomes("weekly-report", 3, ["x"]),
      ...nOutcomes("onboarding", 5, ["y"]),
    ];
    const pb = extractPlaybook("growth", "weekly-report", mixed);
    expect(pb?.fromTaskIds).toHaveLength(3);
    expect(pb?.steps).toEqual(["x"]);
  });

  it("trims and drops empty steps, dedupes task ids", () => {
    const outcomes = [
      outcome("t1", "report", ["  step one  ", ""]),
      outcome("t1", "report", ["step one", "  "]), // duplicate id + step
      outcome("t2", "report", ["step two"]),
    ];
    // 3 outcomes by count (filter is on taskType, not unique id) → at threshold
    const pb = extractPlaybook("growth", "report", outcomes);
    expect(pb?.steps).toEqual(["step one", "step two"]);
    expect(pb?.fromTaskIds).toEqual(["t1", "t2"]);
  });

  it("returns null on blank department or taskType", () => {
    const outcomes = nOutcomes("report", 3);
    expect(extractPlaybook("  ", "report", outcomes)).toBeNull();
    expect(extractPlaybook("growth", "  ", outcomes)).toBeNull();
  });
});

describe("recordPlaybook", () => {
  function pb(departmentId: string, taskType: string): Playbook {
    return { id: playbookId(departmentId, taskType), departmentId, taskType, steps: ["s"], fromTaskIds: ["t1"] };
  }

  it("appends a new playbook", () => {
    const result = recordPlaybook([], pb("growth", "report"));
    expect(result).toEqual({ ok: true, value: [pb("growth", "report")] });
  });

  it("replaces a playbook with the same dept+taskType id (latest-wins)", () => {
    const existing = [pb("growth", "report")];
    const updated: Playbook = { ...pb("growth", "report"), steps: ["new step"] };
    const result = recordPlaybook(existing, updated);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.steps).toEqual(["new step"]);
  });

  it("keeps unrelated playbooks when inserting", () => {
    const existing = [pb("growth", "report")];
    const result = recordPlaybook(existing, pb("sales", "outreach"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toHaveLength(2);
  });

  it("rejects a malformed playbook (errors-as-values)", () => {
    const bad = { id: "", departmentId: "growth", taskType: "report", steps: [], fromTaskIds: [] } as Playbook;
    expect(recordPlaybook([], bad)).toEqual({ ok: false, error: "invalid playbook" });
  });
});

describe("matchPlaybook", () => {
  const playbooks: Playbook[] = [
    { id: playbookId("growth", "report"), departmentId: "growth", taskType: "report", steps: ["s"], fromTaskIds: ["t1"] },
    { id: playbookId("sales", "outreach"), departmentId: "sales", taskType: "outreach", steps: ["s"], fromTaskIds: ["t2"] },
  ];

  it("returns the playbook matching department + taskType", () => {
    expect(matchPlaybook("growth", "report", playbooks)?.id).toBe(playbookId("growth", "report"));
  });

  it("returns null on a taskType miss in the right department", () => {
    expect(matchPlaybook("growth", "onboarding", playbooks)).toBeNull();
  });

  it("returns null on a department miss for the right taskType", () => {
    expect(matchPlaybook("finance", "report", playbooks)).toBeNull();
  });

  it("returns null against an empty playbook set", () => {
    expect(matchPlaybook("growth", "report", [])).toBeNull();
  });

  it("returns null on blank inputs", () => {
    expect(matchPlaybook("", "report", playbooks)).toBeNull();
    expect(matchPlaybook("growth", "", playbooks)).toBeNull();
  });
});

describe("store (tolerant reader, injected fs)", () => {
  function memFs(): { fs: PlaybookStoreFs; files: Map<string, string> } {
    const files = new Map<string, string>();
    return {
      files,
      fs: {
        readFile: async (p) => {
          const v = files.get(p);
          if (v === undefined) throw new Error("ENOENT");
          return v;
        },
        writeFile: async (p, d) => void files.set(p, d),
        mkdir: async () => {},
      },
    };
  }

  const env = { VANTA_HOME: "/tmp/vanta-test" } as NodeJS.ProcessEnv;

  it("missing file reads as []", async () => {
    const { fs } = memFs();
    expect(await readPlaybooks(env, fs)).toEqual([]);
  });

  it("round-trips a written list", async () => {
    const { fs } = memFs();
    const list: Playbook[] = [
      { id: playbookId("growth", "report"), departmentId: "growth", taskType: "report", steps: ["s"], fromTaskIds: ["t1"] },
    ];
    await writePlaybooks(list, env, fs);
    expect(await readPlaybooks(env, fs)).toEqual(list);
  });

  it("corrupt JSON reads as [] (never throws)", async () => {
    const { fs, files } = memFs();
    files.set(`${env.VANTA_HOME}/playbooks.json`, "{ not json");
    expect(await readPlaybooks(env, fs)).toEqual([]);
  });

  it("drops a malformed entry but keeps valid rows", async () => {
    const { fs, files } = memFs();
    const valid = { id: playbookId("growth", "report"), departmentId: "growth", taskType: "report", steps: ["s"], fromTaskIds: ["t1"] };
    files.set(
      `${env.VANTA_HOME}/playbooks.json`,
      JSON.stringify({ version: 1, playbooks: [valid, { id: "" }, "garbage"] }),
    );
    const out = await readPlaybooks(env, fs);
    expect(out).toEqual([valid]);
  });
});
