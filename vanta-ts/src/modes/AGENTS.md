# AGENTS.md — vanta-ts/src/modes

Built-in operator modes installed as skills.

- `builtin.ts` exports `OPERATOR_MODES` and `installModes()`. Current modes include `solutioning-mode`, build/research/review/revenue/opportunity/weekly modes, and `body-double`.
- `solutioning-mode` is the pre-build decision mode: rank what to build, cite sources, and stop before implementation.
- `learning.ts` records repeated patterns and proposes new skills.
- `body-double.ts` is a posture/presence mode, not a task mode.
- `permission-mode.ts` is the permission tier (`default`/`acceptEdits`/`auto`), not an operator-mode skill: parse/resolve from env + `acceptsEditsWithoutKernel`. Edits the gate, never bypasses kernel `block`.

Keep mode bodies concrete: name real tools, require goal-before-tool, require verification-before-done, and avoid fake platform claims.
