# Approval clarity and native app launch — October 3, 2026

## Scope and observed result

Continuation of ordinary Vanta on `codex/librechat-shell-adapter-20261002`,
draft PR #60, from `852142774ecc42540cb136a6ddf1cd4cfe763d63`.
Three workers owned disjoint approval-policy, approval-host and native-launch
files. The parent owned integration, installation and publication.

**Executed:** the updated signed `/Applications/Vanta.app` opened New chat
without a setup form and called `native_app_launch` once for
`com.apple.calculator`. Its receipt reported macOS launch acceptance and
explicitly withheld visible-state verification. Independent native observation
then found Calculator running and its window/keypad visible. No Calculator
input, shell workaround, permission/settings change or screenshot capture was
performed by Vanta. This proves launching, not arbitrary desktop control.

## Corrections

- Profile `always_ask` previously replaced remembered Allow with Ask while the
  prompt displayed the original kernel reason and still offered a saved choice.
  Effective policy now supplies its actual explanation and `canRemember: false`.
  No operator profile preference is silently rewritten.
- TUI suppresses impossible remembered options on unnamed, fresh and each-time
  requests. TUI/Desktop reject forged saved decisions, and task-scoped grants
  cannot bypass explicit each-time policy. Ordinary remembered choices and
  existing Full access/kernel-block behavior are retained.
- Added a typed native launcher: bundle identifier only, static identity lookup,
  exact app-bundle operand to `/usr/bin/open --`. No model-supplied script,
  arguments, URL or document; exact existing effect authority is required.
  Ambiguous launch results remain unknown without automatic retry.
- Registered inventory is 149 built-ins / 153 tools including four factories.
  Computer-task discovery exposes launch, observation and existing vision action.
- Regenerated the source effect inventory: 413 sources / 1,078 primitive calls.
  This also reconciles inherited source moves/hash drift. Source classification
  and hashes are not live behavioral certification of every adapter.

## Executed local checks

No full TypeScript suite was rerun in this iteration.

| Check | Command / surface | Result |
| --- | --- | --- |
| Core approval regressions | `vitest run src/agent/profile-approval-policy.test.ts src/permissions/request.test.ts src/agent/permission-gate.test.ts src/agent/remembered-inner-approval.test.ts` | 55 passed, exit 0; new policy test first failed 3 cases |
| Final combined changed boundaries | `vitest run src/tools/native-app-launch.test.ts src/tools/native-app-launch-run.test.ts src/agent/profile-approval-policy.test.ts src/desktop/approval-remember-eligibility.test.ts src/ui/approval-prompt.test.tsx src/ui/approval-remember-eligibility.test.tsx src/ui/task-approval.test.ts` | 65 passed across 7 files, exit 0 |
| Registration/discovery/request shape | `vitest run src/agent/tool-scope.test.ts src/permissions/request.test.ts src/tools/tools.test.ts -t 'per-task tool scoping\|buildPermissionRequest\|registers all tools'` | 16 passed; 54 unrelated cases intentionally filtered, exit 0 |
| Shared types | `npm run typecheck && npm run desktop:renderer:typecheck` | Exit 0 |
| Effect inventory | `node scripts/generate-trust-01-effect-surface.mjs && node scripts/trust-01-effect-ledger.mjs` | Exit 0; no missing/stale detected sources or direct-executor violations |
| Changed-production size | `lintFiles` over 13 changed production files | Zero violations after extracting the existing session-save block; no hook bypass |
| Final TUI send extraction | Existing `use-agent.test.ts` send cases | 8 passed, 8 unrelated cases filtered; runtime types pass |
| Local package | `npm run desktop:pack` | Exit 0; Developer ID signing and strict verification; no distribution/notarization |
| Guarded install | Existing `installLocalDesktop` with exact hash/signature/stopped-app guards | Exit 0; previous bundle retained |
| Installed real path | New chat → one native tool invocation → receipt → independent Calculator observation | Launch executed and visible; no app-control claim |
| Whitespace | `git diff --check` | Exit 0 |

Native-launch acceptance candidate archive SHA-256:
`b0a6aa823075679af9bf2e41beb04bea3e2a52fb2dc775d1db48962a67809dfd`.
Installed at `2026-10-03T09:55:04.955Z`; rollback/receipt:
`Vanta Local Updates/update-a9VYSL/`.
Previous archive `7187702268d81453443dcd09850c7f2397d69466926350b07e5f3c88e159484b`
is retained. Operator chats/settings were not reset. Private native transcripts
and screenshots are not added to Git.

The final source commit is `ee40bf21b96f8036018f7c7aba514e2a256efdc1`.
After the behavior-preserving TUI session-save extraction, a second signed local
package was installed at `2026-10-03T10:07:57.848Z`, archive SHA-256
`4a3215154266622ad9f7e0c1aee4cc47bcd2c9a4337b094c209d4fdc34117e99`.
Rollback/receipt: `Vanta Local Updates/update-9zVp3V/`. Native observation verified
that this final package reopened the existing chat and composer. Calculator launch
was not repeated on the final archive; its native-tool source is unchanged from
the executed candidate. This distinction is intentional.

The terminal installation was also updated. A fast-forward attempt safely refused
because its old branch had one unique commit; no merge occurred. Source comparison
showed that commit's approval-persistence implementation already present in the
successor. The old branch remains at `12bc974c0383157abcd943f0c129e1fe9c63ef89`;
the installed checkout is detached at the validated code commit. Three user-owned
untracked scripts were retained with identical SHA-256 hashes. The actual global
launcher ran `vanta tools why native_app_launch`, exited 0, and recognized the
tool. This proves updated startup/tool discovery, not interactive approval replay.

The code commit's unchanged pre-commit hooks passed: no staged secret findings,
all 13 changed production files within size limits, and all five architectural
boundaries held. Canonical roadmap projection check passed; status/counts remain
unchanged (1,362 cards; 1,288 shipped, 1 Building, 4 Next, 7 Horizon, 62 Parked).

## Remaining boundaries

- User's original cross-task “don't ask again” complaint is **not declared fully
  resolved** from component tests. Normal-profile persisted-choice acceptance
  across fresh tasks/restart remains required; this change fixes demonstrated
  misleading choices and reason propagation without weakening policy.
- Existing real-TTY replay was not run: its launcher assumes a debug kernel and
  its project-local state is not isolated. It would bootstrap or touch checkout
  state. A disposable launcher fixture is needed; Ink interaction tests are not
  a substitute for installed-launcher proof.
- No arithmetic, clicking or typing inside Calculator was executed. Existing
  vision control is not proven app-scoped here. Research-to-document and ambient
  follow-through remain separate real-path gates.
- Ordinary app launch is currently classified reversible Allow by the existing
  kernel. Do not describe it as requiring fresh human approval on every call.
- Desktop ambient card remains Building. Dependency alerts and unfamiliar-person
  proof remain separate; no merge, release, tag, paid workflow or account action.
