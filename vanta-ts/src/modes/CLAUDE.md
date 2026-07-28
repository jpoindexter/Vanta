# CLAUDE.md — vanta-ts/src/modes

Operator mode definitions and learning.

- `builtin.ts`: installable mode skills. `solutioning-mode` runs research -> ranked recommendation -> stop before build; task modes carry Goal first + Verify before done.
- `learning.ts`: recurrence detector for proposing new skills.
- `body-double.ts`: focus support mode; excluded from task-mode assertions.
- `permission-mode.ts`: `PermissionMode` (`default`/`acceptEdits`/`auto`/`fullAccess`) — permission authority beneath the kernel.
- `operating-mode.ts`: adds `plan`, environment synchronization, and the shared Manual → Accept edits → Plan → Auto cycle. Plan maps to default permission authority plus a separate read-only dispatch gate.

Adding a mode requires updating `builtin.test.ts` expected names and verifying `installModes()` writes the skill.
