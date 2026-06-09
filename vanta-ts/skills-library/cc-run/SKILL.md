---
name: cc-run
description: "Launch and drive this project's app to see a change working in context."
---

# Run

Launch and drive this project's app to confirm a change works in the real runtime environment.

**Distinction from cc-verify:** `cc-run` focuses on launching the full app and exercising the golden path. `cc-verify` is for targeted spot-checks.

## Step 1 — Identify the run command

Check these in order:
1. Look for a project-local skill (`vanta skill cc-run`) that overrides this one
2. Check `package.json` for a `dev` or `start` script
3. Check `run.sh`, `Makefile`, or README for launch instructions
4. Fall back to common patterns by project type

## Step 2 — Launch the app

```bash
# Web app / server
npm run dev
# or
./run.sh

# CLI tool
./run.sh run "example instruction"
# or
npx tsx src/cli.ts <command>
```

## Step 3 — Drive the golden path

Exercise the main flow that the change affects:
- If it's a UI change: navigate to the relevant screen
- If it's a CLI change: run the subcommand
- If it's a server change: make the relevant API request
- If it's a library change: call the function with realistic inputs

## Step 4 — Observe and report

Record what you observed:
- What ran (exact command + args)
- What happened (actual output, not expected)
- Whether it matches the intended behavior
- Any errors, warnings, or unexpected behavior

## Project-specific notes

For the Vanta project:
```bash
# Start agent + kernel
./run.sh run "<instruction>"

# TUI mode
./run.sh

# CLI command
npx tsx vanta-ts/src/cli.ts <command>
```
