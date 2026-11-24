// State the first screen should already have: older chats for the date dividers, a pinned and an archived chat,
// enough chats to need "Load more". Written as session files before the app starts, so the real server lists them.
import fs from "node:fs";
import path from "node:path";

const DAY = 86_400_000;

function session(id, title, ageDays, extra = {}) {
  const at = new Date(Date.now() - ageDays * DAY).toISOString();
  return {
    id,
    title,
    started: at,
    updated: at,
    messages: [
      { role: "user", content: title },
      { role: "assistant", content: `Earlier answer for: ${title}` }
    ],
    ...extra
  };
}

/** One blocked ticket (a team task) so Home's Needs you has a company row. */
function seedBlockedTask(vantaHome) {
  const at = new Date().toISOString();
  const task = { kind: "task", id: "T-1", workerId: "dev", title: "Ship the onboarding flow", status: "blocked", blocker: "needs the final copy", created: at, updated: at };
  fs.mkdirSync(vantaHome, { recursive: true });
  fs.writeFileSync(path.join(vantaHome, "team-tasks.jsonl"), `${JSON.stringify(task)}\n`);
}

export function seedSessions({ vantaHome }) {
  seedBlockedTask(vantaHome);
  const dir = path.join(vantaHome, "sessions");
  fs.mkdirSync(dir, { recursive: true });
  const rows = [
    session("20260901-090000-seed-a", "Quarterly planning notes", 42),
    session("20260905-090000-seed-b", "Competitor pricing review", 38),
    session("20261003-090000-seed-c", "Notes from last week", 10),
    session("20260920-090000-seed-pin", "Pinned: launch checklist", 23, { pinned: true, pinOrder: 0 }),
    session("20260915-090000-seed-arch", "Archived: old spike", 28, { archived: true })
  ];
  for (let n = 0; n < 60; n++) rows.push(session(`20260801-${String(100000 + n)}-seed-bulk${n}`, `Backlog chat ${n + 1}`, 70 + n));
  for (const row of rows) fs.writeFileSync(path.join(dir, `${row.id}.json`), JSON.stringify(row, null, 2));
}
