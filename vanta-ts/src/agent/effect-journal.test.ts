import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildEnvelope, commitEnvelope, reconcileEffectJournal } from "./effect-journal.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-journal-boundary-")); roots.push(root);
  const pending = join(root, ".vanta/effect-journal/pending");
  await mkdir(pending, { recursive: true });
  return { root, pending, target: join(root, ".vanta/work-items.jsonl") };
}

it("keeps durable projection order and byte-idempotent recovery", async () => {
  const f = await fixture();
  const line = JSON.stringify({ id: "exact-item", state: "needs human" });
  const envelope = buildEnvelope("effect", "2026-10-29T10:00:00.000Z", [{ file: "work-items.jsonl", line }]);
  await mkdir(f.target);
  await commitEnvelope(f.root, envelope);
  expect(await readdir(f.pending)).toEqual([`${envelope.id}.json`]);
  await rm(f.target, { recursive: true });
  await reconcileEffectJournal(f.root);
  const bytes = await readFile(f.target, "utf8");
  expect(bytes).toBe(line + "\n");
  await reconcileEffectJournal(f.root);
  expect(await readFile(f.target, "utf8")).toBe(bytes);
  expect(await readdir(f.pending)).toEqual([]);
});

it.each(["hash", "filename", "projection-file", "projection-newline", "header"])("refuses corrupted %s before projection", async mode => {
  const f = await fixture();
  const bytes = '{"id":"existing"}\n'; await writeFile(f.target, bytes);
  const envelope = buildEnvelope("effect", "2026-10-29T10:00:00.000Z", [{ file: "work-items.jsonl", line: '{"id":"new"}' }]);
  const value = JSON.parse(JSON.stringify(envelope));
  if (mode === "hash") value.projections[0].line = '{"id":"changed"}';
  if (mode === "projection-file") value.projections[0].file = "../outside.jsonl";
  if (mode === "projection-newline") value.projections[0].line += "\n";
  if (mode === "header") value.kind = "review-clear";
  const filename = mode === "filename" ? "wrong.json" : `${envelope.id}.json`;
  await writeFile(join(f.pending, filename), JSON.stringify(value));
  await expect(reconcileEffectJournal(f.root)).rejects.toThrow();
  expect(await readFile(f.target, "utf8")).toBe(bytes);
  expect(await readdir(f.pending)).toEqual([filename]);
});
