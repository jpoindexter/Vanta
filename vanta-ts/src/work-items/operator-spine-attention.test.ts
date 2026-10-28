import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { upsertNeedsHumanTicket } from "../operator/needs-human.js";
import { addComment, createTicket, setStatus } from "../tickets/store.js";
import { buildOperatorSpine } from "./operator-spine.js";

const at = "2026-10-28T12:00:00.000Z";
const deps = { now: () => new Date(at), id: () => "blocker-1" };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-attention-"));
  return { root, data: join(root, ".vanta"), env: { VANTA_HOME: join(root, "home") } };
}

it.each(["open", "in_progress", "done", "closed"] as const)("projects real blocker lifecycle: %s", async status => {
  const { root, data, env } = await fixture();
  const input = { kind: "decision" as const, title: "Choose recipient", reason: "Two recipients match", nextAction: "Choose one recipient" };
  await upsertNeedsHumanTicket(data, input, deps);
  await upsertNeedsHumanTicket(data, { ...input, reason: "Recipient is still ambiguous", nextAction: "Choose the intended recipient" }, deps);
  await addComment(data, deps.id(), "An ordinary follow-up does not replace the blocker", deps);
  await setStatus(data, deps.id(), status, deps);
  const before = await readFile(join(data, "tickets.json"), "utf8");
  const snapshot = await buildOperatorSpine(root, { env, now: new Date(at) });
  const active = status === "open" || status === "in_progress";
  expect(snapshot.views.needsYou).toHaveLength(active ? 1 : 0);
  expect(snapshot.workItems[0]?.item).toMatchObject(active ? {
    state: "needs human", blocker: "Recipient is still ambiguous",
    nextAction: "Choose the intended recipient", waitCondition: "Operator input",
  } : { state: status === "done" ? "unverified" : "stopped" });
  expect(await readFile(join(data, "tickets.json"), "utf8")).toBe(before);
});

it("keeps a labeled blocker actionable even without a structured comment", async () => {
  const { root, data, env } = await fixture();
  await createTicket(data, { title: "Review account access", labels: ["needs-human"] }, deps);
  await addComment(data, deps.id(), "Reason: \nNext action: ", deps);
  const snapshot = await buildOperatorSpine(root, { env, now: new Date(at) });
  expect(snapshot.views.needsYou[0]?.item).toMatchObject({
    state: "needs human", blocker: "Review account access", nextAction: "Review ticket blocker-1",
  });
});

it.each(["open", "in_progress", "done", "closed"] as const)("does not reclassify an ordinary ticket: %s", async status => {
  const { root, data, env } = await fixture();
  await createTicket(data, { title: "Research brief", status }, deps);
  const snapshot = await buildOperatorSpine(root, { env, now: new Date(at) });
  expect(snapshot.views.needsYou).toHaveLength(0);
  expect(snapshot.workItems[0]?.item.state).toBe({ open: "draft", in_progress: "running", done: "unverified", closed: "stopped" }[status]);
});
