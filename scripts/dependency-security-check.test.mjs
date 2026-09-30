import assert from "node:assert/strict";
import { test } from "node:test";
import { assessAudit, checkDependencies, dependencyRoots } from "./dependency-security-check.mjs";

function clean() {
  return { status: 0, stdout: JSON.stringify({ vulnerabilities: {}, metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
  } }) };
}

test("accepts only complete zero-finding audit", () => assert.equal(assessAudit(clean()).ok, true));
test("fails closed on command and network errors", () => {
  for (const result of [{ error: new Error("offline") }, { status: 1, stdout: "{}" },
    { status: 0, stdout: "null" },
    { status: 0, stdout: "not json" }, { ...clean(), status: 1 }, { ...clean(), status: null }]) {
    assert.equal(assessAudit(result).ok, false);
  }
});
test("rejects findings even with a zero command exit", () => {
  const report = JSON.parse(clean().stdout);
  report.vulnerabilities.example = { severity: "high" };
  assert.equal(assessAudit({ status: 0, stdout: JSON.stringify(report) }).ok, false);
  report.vulnerabilities = {};
  report.metadata.vulnerabilities.high = 1;
  assert.equal(assessAudit({ status: 0, stdout: JSON.stringify(report) }).ok, false);
});
test("rejects incomplete severity counters", () => {
  const report = JSON.parse(clean().stdout);
  delete report.metadata.vulnerabilities.low;
  assert.equal(assessAudit({ status: 0, stdout: JSON.stringify(report) }).ok, false);
});
test("rejects malformed findings containers", () => {
  for (const findings of [[], 123, "findings"]) {
    const report = JSON.parse(clean().stdout);
    report.vulnerabilities = findings;
    assert.equal(assessAudit({ status: 0, stdout: JSON.stringify(report) }).ok, false);
  }
});
test("checks all three lockfiles including development dependencies", () => {
  const calls = [];
  const report = checkDependencies((command, args, options) => {
    calls.push({ command, args, options });
    return clean();
  });
  assert.equal(report.ok, true);
  assert.equal(calls.length, dependencyRoots.length);
  for (const call of calls) assert.deepEqual(call.args, ["audit", "--package-lock-only", "--json"]);
});
test("one failed tree fails the combined gate without skipping other trees", () => {
  let calls = 0;
  const report = checkDependencies(() => ++calls === 2 ? { status: 1, stdout: "{}" } : clean());
  assert.equal(report.ok, false);
  assert.equal(calls, 3);
});
