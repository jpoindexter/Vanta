// Setup the proof does outside the UI, each one named here so the report can say so:
//  - a kernel goal (the cadence tick only advances a department that has an open standing goal), added through
//    the sandbox kernel's own HTTP API with the sandbox's own API token;
//  - a department file binding the hired worker to that goal (there is no department screen yet);
//  - queueing a ticket without starting it (the UI always starts a run the moment a ticket is assigned).
import fs from "node:fs";
import path from "node:path";

const GOAL_TEXT = "Keep the weekly update on schedule";

function findToken(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "node_modules") stack.push(full); }
      else if (entry.name === "api-token") return fs.readFileSync(full, "utf8").trim();
    }
  }
  return null;
}

/** Add one active goal to the sandbox kernel and return its id. */
export async function addKernelGoal(box) {
  const token = findToken(box.root);
  if (!token) throw new Error("no .vanta/api-token found in the sandbox: the kernel did not start");
  const base = `http://127.0.0.1:${box.kernelPort}`;
  const headers = { Authorization: `Bearer ${token}` };
  const added = await fetch(`${base}/api/goals/add`, { method: "POST", headers, body: GOAL_TEXT });
  if (!added.ok) throw new Error(`kernel refused the goal: ${added.status}`);
  const goals = await (await fetch(`${base}/api/goals`, { headers })).json();
  const list = Array.isArray(goals) ? goals : goals.goals ?? [];
  const goal = list.find((g) => g.text === GOAL_TEXT);
  if (!goal) throw new Error(`goal not listed after adding: ${JSON.stringify(goals).slice(0, 200)}`);
  return goal.id;
}

/** departments.json in the sandbox VANTA_HOME: "Product", owning the hired worker and the goal. */
export function writeDepartment(box, workerId, goalId) {
  const at = new Date().toISOString();
  const department = { id: "product", name: "Product", workerIds: [workerId], budgetScope: "dept:product", goalIds: [goalId], skillIds: [], createdAt: at, updatedAt: at };
  fs.writeFileSync(path.join(box.vantaHome, "departments.json"), `${JSON.stringify({ version: 1, departments: [department] }, null, 2)}\n`);
}

/** Call a company route through the app's own Electron bridge (the same path the screens use). */
export function bridgeCall(page, method, route, body) {
  return page.evaluate(([m, p, b]) => window.hermesDesktop.vanta.request({ method: m, path: p, body: b, clientId: "company-ui" }), [method, route, body]);
}
