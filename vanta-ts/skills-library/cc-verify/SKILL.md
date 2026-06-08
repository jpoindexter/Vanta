---
name: cc-verify
description: "Verify a code change actually works by running the app and observing behavior. Tests pass ≠ change works."
---

# Verify

Verify that a code change actually does what it's supposed to do by running the app and observing behavior.

**Key principle:** A green test suite proves the code compiles and existing tests pass. It does NOT prove the change works. Verification means observing the actual behavior.

## When to use

- After implementing a feature or fix
- Before claiming "done" or "working"
- When the user asks "does this work?" or "can you verify?"

## Instructions

1. Understand what the change claims to do:
   ```bash
   git diff HEAD --stat
   ```

2. Run the test suite first:
   ```bash
   npm test
   ```
   If tests fail, stop — the change is broken. Fix before verifying.

3. Identify the right verification method:
   - **CLI tool**: run it with representative args and inspect the output
   - **Server/API**: start it and make a real request
   - **Library function**: write a quick inline test or use the REPL
   - **UI change**: start the dev server and observe in a browser

4. Run the actual verification:
   ```bash
   # For Vanta CLI changes:
   cd /path/to/repo && ./run.sh run "<instruction that exercises the change>"
   # Or for direct tool test:
   node -e "import('./src/...').then(m => console.log(m.fn(...)))"
   ```

5. Report: what you ran, what you observed, and whether the change works. Cite the actual output — not the expected output.

6. If verification is not possible (no runtime, no TTY, external service), state that explicitly. Do NOT claim "done" without evidence.
