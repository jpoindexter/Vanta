# CLAUDE.md — vanta-ts/src/modes

Operator mode definitions and learning.

- `builtin.ts`: installable mode skills. `solutioning-mode` runs research -> ranked recommendation -> stop before build; task modes carry Goal first + Verify before done.
- `learning.ts`: recurrence detector for proposing new skills.
- `body-double.ts`: focus support mode; excluded from task-mode assertions.
- `permission-mode.ts`: `PermissionMode` (`default`/`acceptEdits`/`auto`) — `parse`/`resolve`/`envFor` + `acceptsEditsWithoutKernel`. Not an operator-mode skill; the kernel-gate permission tier.

Adding a mode requires updating `builtin.test.ts` expected names and verifying `installModes()` writes the skill.
