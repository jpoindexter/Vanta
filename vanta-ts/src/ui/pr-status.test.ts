import { describe, it, expect } from "vitest";
import {
  parsePrStatus,
  formatPrStatusLine,
  pollPrStatus,
  type PrStatus,
  type RunGh,
} from "./pr-status.js";

// A representative `gh pr view --json ...` payload (an object — gh's default
// single-PR shape). statusCheckRollup mixes CheckRun (conclusion) and
// StatusContext (state) entries across passing/failing/pending.
const FULL_JSON = JSON.stringify({
  number: 12,
  title: "Add PR status polling",
  state: "OPEN",
  reviewDecision: "APPROVED",
  mergeable: "MERGEABLE",
  statusCheckRollup: [
    { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
    { __typename: "StatusContext", state: "PENDING" },
  ],
});

describe("parsePrStatus", () => {
  it("parses a full gh payload with rolled-up check counts", () => {
    const status = parsePrStatus(FULL_JSON);
    expect(status).not.toBeNull();
    expect(status?.number).toBe(12);
    expect(status?.title).toBe("Add PR status polling");
    expect(status?.state).toBe("OPEN");
    expect(status?.reviewDecision).toBe("APPROVED");
    expect(status?.mergeable).toBe("MERGEABLE");
    expect(status?.checks).toEqual({ passing: 4, failing: 1, pending: 1 });
  });

  it("accepts a one-element array (gh's other output shape)", () => {
    const arrayJson = `[${JSON.stringify({ number: 7, state: "OPEN", statusCheckRollup: [] })}]`;
    const status = parsePrStatus(arrayJson);
    expect(status?.number).toBe(7);
    expect(status?.checks).toEqual({ passing: 0, failing: 0, pending: 0 });
  });

  it("classifies a CheckRun with no conclusion as pending (still running)", () => {
    const json = JSON.stringify({
      number: 1,
      state: "OPEN",
      statusCheckRollup: [{ __typename: "CheckRun", status: "IN_PROGRESS" }],
    });
    expect(parsePrStatus(json)?.checks).toEqual({ passing: 0, failing: 0, pending: 1 });
  });

  it("treats NEUTRAL/SKIPPED as passing and ERROR/CANCELLED as failing", () => {
    const json = JSON.stringify({
      number: 2,
      state: "OPEN",
      statusCheckRollup: [
        { conclusion: "NEUTRAL" },
        { conclusion: "SKIPPED" },
        { conclusion: "ERROR" },
        { conclusion: "CANCELLED" },
        { conclusion: "TIMED_OUT" },
      ],
    });
    expect(parsePrStatus(json)?.checks).toEqual({ passing: 2, failing: 3, pending: 0 });
  });

  it("rolls StatusContext entries by their state field", () => {
    const json = JSON.stringify({
      number: 3,
      state: "OPEN",
      statusCheckRollup: [{ state: "SUCCESS" }, { state: "FAILURE" }, { state: "PENDING" }],
    });
    expect(parsePrStatus(json)?.checks).toEqual({ passing: 1, failing: 1, pending: 1 });
  });

  it("handles each reviewDecision value", () => {
    for (const decision of ["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"]) {
      const json = JSON.stringify({ number: 1, state: "OPEN", reviewDecision: decision, statusCheckRollup: [] });
      expect(parsePrStatus(json)?.reviewDecision).toBe(decision);
    }
  });

  it("omits reviewDecision/mergeable/title when absent or empty", () => {
    const json = JSON.stringify({ number: 9, state: "OPEN", reviewDecision: "", mergeable: "", title: "  ", statusCheckRollup: [] });
    const status = parsePrStatus(json);
    expect(status?.reviewDecision).toBeUndefined();
    expect(status?.mergeable).toBeUndefined();
    expect(status?.title).toBeUndefined();
  });

  it("defaults state to '' when missing and checks to all-zero on a non-array rollup", () => {
    const json = JSON.stringify({ number: 4, statusCheckRollup: "not-an-array" });
    const status = parsePrStatus(json);
    expect(status?.state).toBe("");
    expect(status?.checks).toEqual({ passing: 0, failing: 0, pending: 0 });
  });

  it("control-strips an attacker-chosen title (no ANSI/control escape injection)", () => {
    // A title with an ANSI sequence + a newline + a NUL — all must be stripped.
    const evil = "\x1b[31mpwn\x1b[0m\nsecond\x00line";
    const json = JSON.stringify({ number: 5, state: "OPEN", title: evil, statusCheckRollup: [] });
    const title = parsePrStatus(json)?.title ?? "";
    expect(title).toBe("pwn second line");
    expect(title).not.toContain("\x1b");
    expect(title).not.toContain("\n");
    expect(title).not.toContain("\x00");
  });

  it("returns null on an empty string", () => {
    expect(parsePrStatus("")).toBeNull();
    expect(parsePrStatus("   ")).toBeNull();
  });

  it("returns null on gh's empty-array (no PR for the branch)", () => {
    expect(parsePrStatus("[]")).toBeNull();
  });

  it("returns null on garbage / invalid JSON", () => {
    expect(parsePrStatus("not json")).toBeNull();
    expect(parsePrStatus("{ broken")).toBeNull();
  });

  it("returns null when the number field is missing or non-numeric", () => {
    expect(parsePrStatus(JSON.stringify({ state: "OPEN" }))).toBeNull();
    expect(parsePrStatus(JSON.stringify({ number: "12", state: "OPEN" }))).toBeNull();
  });

  it("returns null on a JSON primitive (string/number/null)", () => {
    expect(parsePrStatus("42")).toBeNull();
    expect(parsePrStatus("\"hi\"")).toBeNull();
    expect(parsePrStatus("null")).toBeNull();
  });
});

describe("formatPrStatusLine", () => {
  const base: PrStatus = { number: 12, state: "OPEN", checks: { passing: 0, failing: 0, pending: 0 } };

  it("renders approved with mixed checks and mergeable", () => {
    const status: PrStatus = { ...base, reviewDecision: "APPROVED", mergeable: "MERGEABLE", checks: { passing: 4, failing: 1, pending: 0 } };
    expect(formatPrStatusLine(status)).toBe("PR #12 ✓ approved · checks 4✓/1✗ · mergeable");
  });

  it("renders review pending with only passing checks (no review decision yet)", () => {
    const status: PrStatus = { ...base, number: 5, checks: { passing: 5, failing: 0, pending: 0 } };
    expect(formatPrStatusLine(status)).toBe("PR #5 ⧗ review pending · checks 5✓");
  });

  it("renders changes-requested + conflicts", () => {
    const status: PrStatus = { ...base, reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING", checks: { passing: 2, failing: 0, pending: 1 } };
    expect(formatPrStatusLine(status)).toBe("PR #12 ✗ changes requested · checks 2✓/1⧗ · conflicts");
  });

  it("renders review-required and drops an UNKNOWN mergeable", () => {
    const status: PrStatus = { ...base, reviewDecision: "REVIEW_REQUIRED", mergeable: "UNKNOWN" };
    expect(formatPrStatusLine(status)).toBe("PR #12 ⧗ review required");
  });

  it("drops the checks segment entirely when there are no checks", () => {
    const status: PrStatus = { ...base, reviewDecision: "APPROVED" };
    expect(formatPrStatusLine(status)).toBe("PR #12 ✓ approved");
  });
});

describe("pollPrStatus", () => {
  it("returns the parsed status from the injected gh runner", async () => {
    const runGh: RunGh = async () => FULL_JSON;
    const status = await pollPrStatus({ runGh });
    expect(status?.number).toBe(12);
    expect(status?.checks).toEqual({ passing: 4, failing: 1, pending: 1 });
  });

  it("invokes gh with the documented --json field set", async () => {
    let captured: string[] = [];
    const runGh: RunGh = async (args) => {
      captured = args;
      return FULL_JSON;
    };
    await pollPrStatus({ runGh });
    expect(captured).toEqual(["pr", "view", "--json", "number,title,state,reviewDecision,statusCheckRollup,mergeable"]);
  });

  it("returns null when the runner throws (gh failure / no PR / not a repo), never throwing", async () => {
    const runGh: RunGh = async () => {
      throw new Error("no pull requests found for branch");
    };
    await expect(pollPrStatus({ runGh })).resolves.toBeNull();
  });

  it("returns null on empty runner output", async () => {
    const runGh: RunGh = async () => "   ";
    expect(await pollPrStatus({ runGh })).toBeNull();
  });

  it("returns null when gh prints garbage", async () => {
    const runGh: RunGh = async () => "not json at all";
    expect(await pollPrStatus({ runGh })).toBeNull();
  });
});
