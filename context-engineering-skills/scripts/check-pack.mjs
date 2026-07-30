#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

async function main() {
  const skillsPath = join(ROOT, "skills");
  const names = (await readdir(skillsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (names.length !== 3) throw new Error(`expected 3 skills, found ${names.length}`);

  for (const name of names) {
    const skillPath = join(skillsPath, name, "SKILL.md");
    const source = await readFile(skillPath, "utf8");
    if (!source.startsWith("---\n")) throw new Error(`${name}: missing frontmatter`);
    if (!new RegExp(`^name: ${name}$`, "m").test(source)) {
      throw new Error(`${name}: frontmatter name mismatch`);
    }
    const description = source.match(/^description: (.+)$/m)?.[1] ?? "";
    if (description.length < 100) throw new Error(`${name}: description is too vague`);
    if (source.includes("[TODO")) throw new Error(`${name}: contains TODO template text`);
    if (source.split("\n").length > 220) {
      throw new Error(`${name}: entry point is too large`);
    }

    const agentPath = join(skillsPath, name, "agents", "openai.yaml");
    const agent = await readFile(agentPath, "utf8");
    if (!agent.includes("display_name:") || !agent.includes("default_prompt:")) {
      throw new Error(`${name}: incomplete agents/openai.yaml`);
    }
  }

  const installer = await stat(join(ROOT, "scripts", "install.sh"));
  if (!installer.isFile()) throw new Error("missing installer");
  process.stdout.write(`Validated ${names.length} context-engineering skills.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
