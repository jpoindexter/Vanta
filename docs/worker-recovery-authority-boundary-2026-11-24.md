# Worker recovery: provenance before authority

Owner: Jason. Existing card: `DELEGATION-LIVE-STEERING-BUDGET`.
This is a source-grounded implementation boundary, not executed continuation
acceptance or a new worker framework. Preserve the existing acceptance contract.

## Observed source seams

- `AgentDeps` and `ToolContext` carry an optional host session ID, but no
  profile-bound child-custody capability. `agent.ts` builds the tool context.
- `delegate.ts` records the parent session in its private worker checkpoint.
  `worker-inspection.ts` validates ID and canonical project root. The checkpoint
  is data, not an independently expected parent/profile/branch authority.
- Desktop already binds live-chat ownership to canonical project, canonical
  profile home and profile in `desktop/live-session.ts`. Use `state._env`, as
  that existing boundary does; do not substitute assumed process-global identity.
- Conversation forks receive a fresh UUID-suffixed session ID and retain their
  parent ID in `sessions/fork-at.ts`. Require the exact spawning session, not
  merely an ancestor chat. Git worktree identity is separate: the host-created
  `WorktreeHandle` already contains a path and branch.
- Existing session persistence supplies private flushed rename and cross-process
  locking. Validate every managed ancestor as well as leaf files when reusing it.

These findings were independently investigated read-only and checked against
the current source. They are code-path evidence, not a runtime security claim.

## Dependency-ordered implementation and proof

1. Carry a host-owned custody port through `AgentDeps` to `ToolContext`. Capture
   canonical project/profile-home, selected profile and exact spawning session
   from the host, not tool arguments. Preserve CLI/TUI/Desktop differences.
2. Before the first worker provider call, atomically bind its full generated
   UUID, worker root and applicable Git branch to that host expectation in a
   host-private metadata index. Compare checkpoint data against this index
   after restart. Neither a short ID nor a self-asserted label is authority.
3. Execute fresh-process same-owner readback and refusal for unrelated parent,
   ancestor/forked chat, foreign profile/home/project/worktree, changed branch,
   missing/corrupt/oversized index, symlink ancestors and concurrent ownership.
   Missing identity and legacy no-index records remain inspection-only.
4. Separately establish inherited remaining iteration/tool/token/time/cost
   budgets, honest pending-request uncertainty and reconciled effects. Only
   then design explicit continuation under current policy. Never restore old
   approvals, renew a spent capability or automatically replay unknown effects.

Metadata provenance does not need a Rust policy change. Private `0600` files
alone do not establish an agent-inaccessible authority store, however. Do not
claim kernel-protected recovery capability without separately authorized
protected-boundary work and adversarial proof. No protected Rust or factory
source, owner profile, credential, grant or installed runtime was changed by
this investigation.

Accounting must remain separate from action/session identity. Setting a child
`deps.sessionId` solely for telemetry would also invoke normal-session
checkpointing in `agent/effect-persistence.ts`; that is not a safe accounting
shortcut. Existing terminal usage is not a complete remaining-budget ledger.
