import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("roadmap path required");

const roadmap = JSON.parse(await readFile(file, "utf8"));
const evidence = {
  "DESKTOP-CODEX-KEELHOUSE-SHELL": "Implemented 2026-07-14: ported Keelhouse's project-first task hierarchy into Vanta Desktop with an app-level titlebar, central run surface, composer-owned model/context controls, collapsible task rail, and contextual inspector closed at startup. Packaged Electron layout smoke passed at 1778x1136, 760x900, and 640x900; the captured shell shows no empty black right region.",
  "DESKTOP-MODEL-PICKER-UX": "Implemented 2026-07-14: replaced the repeated model/default tile grid with a searchable provider rail and model list, active/default state, one secondary default action, typed model IDs, and server-side live discovery with static fallback. Renderer tests passed and packaged Electron smoke proved 27 providers and 22 visible models without clipping at desktop and compact widths.",
};

for (const [id, note] of Object.entries(evidence)) {
  const item = roadmap.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing roadmap item ${id}`);
  item.notes = note;
  item.updated = "2026-07-14";
}

await writeFile(file, `${JSON.stringify(roadmap, null, 2)}\n`);
