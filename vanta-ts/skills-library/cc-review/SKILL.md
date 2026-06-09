---
name: cc-review
description: "Review changed code for correctness bugs and reuse/simplification cleanups. High-confidence findings only."
---

# Code Review

Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups.

**Scope:** correctness bugs and cleanup opportunities at the specified effort level (default: medium).
**Not in scope:** style preferences, minor naming, hypothetical future needs.
**Output:** location-tagged findings with `file:line` references and concrete one-line fixes.

## Instructions

1. Get the current diff:
   ```bash
   git diff HEAD
   ```
   If nothing staged, try:
   ```bash
   git diff
   ```

2. Review the diff for:
   - **Bugs**: logic errors, off-by-one, null/undefined dereference, async/await mistakes, type mismatches
   - **Security**: SQL injection, XSS, command injection, exposed secrets, missing auth checks
   - **Cleanup**: dead code, duplicated logic (extract to helper), inefficient loops, unnecessary dependencies
   - **Tests**: missing test coverage for new code paths

3. Report findings as:
   ```
   [HIGH|MED|LOW] file:line — description
   Fix: concrete one-line fix
   ```

4. Report only high-confidence findings. If uncertain, omit. Never invent findings.

5. If clean: output `✓ no issues found`.

## Effort levels

- **low**: only definite bugs and security issues
- **medium** (default): bugs + obvious cleanup opportunities
- **high**: thorough scan including edge cases and test gaps
