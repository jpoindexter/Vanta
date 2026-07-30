import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  auditContext,
  renderMarkdown,
} from "../skills/context-doctor/scripts/audit-context.mjs";

test("separates always-on files from on-demand skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-doctor-"));
  await writeFile(join(root, "AGENTS.md"), "# Rules\n\nKeep the repository safe.\n");
  await mkdir(join(root, ".claude", "skills", "release"), { recursive: true });
  await writeFile(
    join(root, ".claude", "skills", "release", "SKILL.md"),
    "---\nname: release\n---\n\nRun only for releases.\n",
  );

  const report = await auditContext(root);

  assert.equal(report.totals.alwaysOnSources, 1);
  assert.equal(report.totals.sources, 2);
  assert.equal(
    report.sources.find((source) => source.path === "AGENTS.md")?.layer,
    "always-on",
  );
  assert.equal(
    report.sources.find((source) => source.path.endsWith("SKILL.md"))?.layer,
    "on-demand-skill",
  );
});

test("reports exact repeated guidance across files without editing", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-doctor-"));
  const repeated = "Never print secrets from local configuration files.";
  await writeFile(join(root, "AGENTS.md"), `${repeated}\n`);
  await writeFile(join(root, "CLAUDE.md"), `- ${repeated}\n`);

  const report = await auditContext(root);
  const markdown = renderMarkdown(report);

  assert.equal(report.duplicates.length, 1);
  assert.match(markdown, /AGENTS\.md:1/);
  assert.match(markdown, /CLAUDE\.md:1/);
});

test("ignores dependency trees", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-doctor-"));
  await mkdir(join(root, "node_modules", "package"), { recursive: true });
  await writeFile(join(root, "node_modules", "package", "AGENTS.md"), "Ignore me.\n");

  const report = await auditContext(root);

  assert.equal(report.totals.sources, 0);
});
