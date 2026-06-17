---
id: examples
title: Examples
sidebar_position: 4
---

# Examples

Worked end-to-end examples — copy, adapt, run.

## A one-shot run

```bash
./run.sh run "read README.md and summarize it in 5 bullets"
```

Vanta starts the kernel if needed, reads the file (a kernel-`allow` read), and prints the summary. Nothing is written, so nothing prompts.

## An interactive session

```text
$ vanta
❯ set a goal: ship the docs site
  ◎ goal set: ship the docs site

❯ what's left to do?
⏺ Read(ROADMAP.md)
  ⎿  …
  Here are the three remaining slices …

❯ commit the changes with a clear message
⏺ Git(commit)
  Do you want to proceed?  ❯ 1 Yes   2 Yes, don't ask again   3 No   4 Never
```

A read runs immediately; the commit is irreversible, so the kernel escalates it to `ask` and you get the approval prompt.

## Set a goal, get the next step

```text
❯ /goal improve test coverage on the kernel client
❯ /next
  → "Add a test for the 401-retry path in safety-client.ts …"
```

A vague goal auto-surfaces one concrete micro-step; the working goal shows in the footer `◇` line.

## Schedule a recurring task

```bash
vanta schedule "summarize my unread email and post a brief" --cron "0 8 * * *"
vanta schedule list
```

Runs every day at 08:00 when the scheduler fires (`vanta cron`, OS-invoked, or the always-on `vanta gateway`).

## Write a skill

Skills live at `~/.vanta/skills/<slug>/SKILL.md`:

```markdown
---
name: weekly-review
description: Run my Friday weekly review across goals, money, and radar.
---

1. Read active goals and the Money OS weekly snapshot.
2. List shipped vs slipped slices from the roadmap.
3. Draft three priorities for next week and ask me to confirm.
```

`vanta skill weekly-review` runs it; the skill index is injected into the prompt and the body loads on demand.

## Mount an MCP server

`.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "sqlite": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sqlite", "./data.db"] }
  }
}
```

Its tools mount as kernel-gated Vanta tools on next launch. See [MCP integration](./mcp.md).

## Add a custom tool

A minimal tool — see [Extending Vanta](./extending.md) for the full walkthrough:

```ts
// tools/word-count.ts
export const wordCount: Tool = {
  schema: { name: "word_count", description: "Count words in a file.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  describeForSafety: (a) => `read file ${a.path}`,
  async execute(args, ctx) {
    const text = await ctx.readFile(args.path);
    return { ok: true, output: `${text.trim().split(/\s+/).length} words` };
  },
};
```

Register it in `tools/all-tools.ts` — it's then kernel-gated like every built-in.

## Full reference

- Every tool, with parameters → [Tool reference](./reference/tools-list.md)
- Every slash command → [Command reference](./reference/commands-list.md)
- Every environment variable → [Environment variables](./reference/environment.md)
- Every CLI subcommand → [CLI reference](./reference/cli.md)
