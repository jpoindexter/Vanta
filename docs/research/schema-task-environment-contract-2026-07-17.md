# Schema Task Environment Contract

Status: shipped 2026-07-17

## Outcome

Vanta now has a versioned TypeScript boundary for deterministic task environments at `vanta-ts/src/schema/index.ts`. Adapters declare their observation, snapshot, and legal-action schemas plus the functions needed to observe, predict, act, detect terminal state, and verify the resulting state.

The public contract records both sides of a real transition:

- the validated snapshot and observation before an action;
- the validated action and predicted transition summary;
- the observed result and snapshot after the action;
- the terminal reason, when present;
- the verifier result.

Invalid actions, malformed observations, and malformed snapshots return typed failures instead of throwing or silently entering the transcript.

## Fixture Proof

`fixtures.ts` provides isolated repo and browser adapters. The repo fixture models file writes and terminal completion. The browser fixture models navigation and form entry. Both can replay an action sequence through the same `replayFixture` function.

Contract tests prove:

- repo replay is deterministic across fresh adapters;
- browser replay is deterministic across fresh adapters;
- invalid actions fail as `invalid_action`;
- malformed observations fail as `malformed_observation` before and after an action;
- the public `schema/index.ts` entrypoint exposes contract version `1`.

## Verification

Executed from `vanta-ts/`:

```text
npm test -- --run src/schema/task-environment.test.ts src/schema/task-environment-boundary.test.ts
2 files, 6 tests passed

npm test -- --run src/ui/app-mode.test.tsx src/modes/permission-mode.test.ts
2 files, 19 tests passed

npm run typecheck
passed
```

The permission-mode tests cover a repo-wide typecheck regression exposed by the new `fullAccess` mode. The established TUI cycle remains `default -> acceptEdits -> auto -> default`; externally selected full access is visible and Shift+Tab returns it to default.

## Boundary

This slice establishes the task protocol and deterministic fixtures. It does not yet persist transitions, execute generated models, or connect real repo/browser side effects. Those concerns remain in the transition timeline, sandbox, and controlled-commit roadmap cards.
