# MCP Explicit-Empty Allowlist Audit

Date: 2026-08-26

Branch: `codex/mcp-explicit-empty-allowlist-20260826`

Baseline: `4cb3dae364988bf09cbea91871b8cf22a2ddc3fa`

## Outcome

Vanta now preserves all three MCP tool-policy states across configuration, trust identity, launch, discovery, registry projection, delegation, CLI, TUI, and Desktop surfaces:

- omitted `tools`: expose all tools discovered from the configured server;
- `tools: []`: expose and advertise zero tools;
- named `tools`: expose only the exact named tools that the server provides.

The correction is fail-closed for explicit-empty policy. A stale pre-reconnect inventory cannot widen an explicit-empty configuration, and excluded schemas do not enter tool search or model-visible prompt inventory.

## Reproduction

Before the correction, focused regression tests demonstrated two widening failures:

- an MCP server configured with `tools: []` mounted two discovered tools instead of zero;
- `buildScopedRegistry([])` returned all 152 registered schemas instead of zero.

The defect was caused by treating a missing allowlist and an empty allowlist as the same condition at multiple boundaries. The management connection path also persisted the full discovered inventory without applying the configured policy.

## Implementation boundaries

The shared policy lives in `vanta-ts/src/mcp/tool-policy.ts`. It is applied to discovered tool definitions and to persisted tool-name inventories. Trust decision keys distinguish an omitted policy from an explicit empty array.

No protected Rust source, factory source, `MANIFESTO.md`, installed Vanta checkout, local Vanta state, credential, Hermes content, or Nightcode content was changed.

## Executed verification

| Gate | Result |
| --- | --- |
| Focused MCP, registry, delegation, CLI, TUI, Desktop, and sandbox suite | 13 files, 161 tests passed |
| Full TypeScript suite | 1,552 files passed; 14,259 passed; 3 skipped; 0 failed |
| Runtime TypeScript typecheck | exit 0 |
| Desktop renderer typecheck | exit 0 |
| TypeScript compatibility test | 1 passed |
| Desktop production build | exit 0; 1,648 modules transformed |
| Rust tests | 70 passed; 0 failed |
| Changed production source size | every file at most 300 lines; new/materially refactored functions at most 50 lines, 4 parameters, and complexity 10 |
| Semgrep over changed production TypeScript | 74 rules, 8 targets, 0 findings |
| Complete-history and current-snapshot secret scan | 2,168 commits and current snapshot; 0 findings |
| Git whitespace check | exit 0 |

The focused suite includes a real stdio MCP test server, reconnection and stale-inventory cases, delegated registry behavior, the Desktop operator HTTP API, the TUI MCP panel, and the Desktop connector view.

## Evidence limits

This audit proves the source checkout's executed local paths. It does not establish a packaged-app manual interaction, hosted CI, deployment, release, or end-user outcome. GitHub Actions remained disabled and no release or deployment workflow was used.
