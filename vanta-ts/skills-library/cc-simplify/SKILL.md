---
name: cc-simplify
description: "Review changed code for reuse, simplification, efficiency, and altitude cleanups. Quality only — no bug hunt."
---

# Simplify

Review the changed code for reuse, simplification, efficiency, and altitude cleanups. Apply the fixes.

**Scope:** code quality, not correctness. For bugs, use `cc-review`.
**Goal:** leave the code simpler, cleaner, and easier to read — not just shorter.

## What to look for

- **Reuse**: extract duplicated logic into a helper. Three similar lines is the threshold.
- **Simplification**: reduce nesting, collapse equivalent branches, replace verbose patterns with idiomatic constructs.
- **Efficiency**: remove N+1 loops, unnecessary re-computation, redundant I/O.
- **Altitude**: ensure each function does one thing at one level of abstraction.
- **Dead weight**: remove commented-out code, unused variables, empty catch blocks.

## What to skip

- Renaming (subjective)
- Style preferences not enforced by the linter
- Hypothetical future abstractions
- Anything that changes behavior

## Instructions

1. Get the changed files:
   ```bash
   git diff HEAD --name-only
   ```

2. Read only the changed sections.

3. Identify cleanup opportunities (reuse / simplify / efficiency / altitude).

4. Apply each fix directly. Confirm the suite still passes after changes:
   ```bash
   npm test
   ```

5. Report what was changed and why. If nothing to simplify: `✓ already clean`.
