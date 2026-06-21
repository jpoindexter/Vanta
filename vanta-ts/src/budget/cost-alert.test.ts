import { describe, it, expect } from "vitest";
import {
  costAlertLevel,
  nextCostAlert,
  formatCostAlert,
  freshCostAlertState,
  COST_WARN_FRACTION,
} from "./cost-alert.js";

describe("costAlertLevel", () => {
  it("is none below 80% of the cap", () => {
    expect(costAlertLevel(0, 10)).toBe("none");
    expect(costAlertLevel(7.99, 10)).toBe("none");
  });
  it("is warning between 80% and the cap", () => {
    expect(costAlertLevel(8, 10)).toBe("warning");
    expect(costAlertLevel(9.99, 10)).toBe("warning");
  });
  it("is exceeded at/above the cap", () => {
    expect(costAlertLevel(10, 10)).toBe("exceeded");
    expect(costAlertLevel(15, 10)).toBe("exceeded");
  });
  it("is none with no cap (zero, negative, or non-finite limit)", () => {
    expect(costAlertLevel(99, 0)).toBe("none");
    expect(costAlertLevel(99, -5)).toBe("none");
    expect(costAlertLevel(99, Number.NaN)).toBe("none");
    expect(costAlertLevel(99, Number.POSITIVE_INFINITY)).toBe("none");
  });
  it("is none with a non-finite spend", () => {
    expect(costAlertLevel(Number.NaN, 10)).toBe("none");
  });
  it("reuses the budget model's 0.8 warn fraction", () => {
    expect(COST_WARN_FRACTION).toBe(0.8);
  });
});

describe("formatCostAlert", () => {
  it("warning includes the amounts and the threshold percent", () => {
    const msg = formatCostAlert("warning", 8, 10);
    expect(msg).toContain("$8.00");
    expect(msg).toContain("$10.00");
    expect(msg).toContain("80%");
    expect(msg).toContain("approaching budget");
  });
  it("exceeded includes the cap amount", () => {
    const msg = formatCostAlert("exceeded", 12, 10);
    expect(msg).toContain("$10.00");
    expect(msg).toContain("budget cap reached");
  });
  it("none has no surface", () => {
    expect(formatCostAlert("none", 1, 10)).toBe("");
  });
});

describe("nextCostAlert", () => {
  it("does not alert below the warn threshold", () => {
    const r = nextCostAlert(freshCostAlertState(), 5, 10);
    expect(r.alert).toBeNull();
    expect(r.state.lastAlerted).toBe("none");
  });

  it("fires the warning alert once on first crossing", () => {
    const r = nextCostAlert(freshCostAlertState(), 8, 10);
    expect(r.alert).toContain("approaching budget");
    expect(r.state.lastAlerted).toBe("warning");
  });

  it("does not re-alert at the same warning level", () => {
    const first = nextCostAlert(freshCostAlertState(), 8, 10);
    const second = nextCostAlert(first.state, 9, 10);
    expect(second.alert).toBeNull();
    expect(second.state.lastAlerted).toBe("warning");
  });

  it("escalates warning → exceeded and fires the exceeded alert once", () => {
    const warn = nextCostAlert(freshCostAlertState(), 8, 10);
    const exceeded = nextCostAlert(warn.state, 10, 10);
    expect(exceeded.alert).toContain("budget cap reached");
    expect(exceeded.state.lastAlerted).toBe("exceeded");
    const again = nextCostAlert(exceeded.state, 12, 10);
    expect(again.alert).toBeNull();
    expect(again.state.lastAlerted).toBe("exceeded");
  });

  it("can jump straight from none to exceeded in one step", () => {
    const r = nextCostAlert(freshCostAlertState(), 50, 10);
    expect(r.alert).toContain("budget cap reached");
    expect(r.state.lastAlerted).toBe("exceeded");
  });

  it("a drop in level after exceeded does not fire a fresh alert", () => {
    const exceeded = nextCostAlert(freshCostAlertState(), 10, 10);
    const dropped = nextCostAlert(exceeded.state, 5, 10);
    expect(dropped.alert).toBeNull();
    expect(dropped.state.lastAlerted).toBe("exceeded");
  });

  it("never alerts with no cap set (zero limit)", () => {
    const r = nextCostAlert(freshCostAlertState(), 1000, 0);
    expect(r.alert).toBeNull();
    expect(r.state.lastAlerted).toBe("none");
  });

  it("returns the same state object (immutable) when it does not alert", () => {
    const state = { lastAlerted: "warning" as const };
    const r = nextCostAlert(state, 9, 10);
    expect(r.state).toBe(state);
  });

  it("returns a new state object on escalation, leaving the input untouched", () => {
    const state = freshCostAlertState();
    const r = nextCostAlert(state, 8, 10);
    expect(r.state).not.toBe(state);
    expect(state.lastAlerted).toBe("none");
  });
});
