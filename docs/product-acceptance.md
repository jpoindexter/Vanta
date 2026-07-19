# Product acceptance

Updated 2026-07-19. This record separates executed behavior from static tests and external setup gates.

## Executed operator paths

| Story | Result | Evidence |
|---|---|---|
| Read a project file with a real model | Pass | `read_file` returned the README heading and the model returned the exact acceptance marker in 2 iterations. |
| Write and read back a file | Pass | The model wrote `.vanta/eval-runs/product-acceptance/model-write.txt`, read it back, and returned the exact marker in 3 iterations. |
| Recall an ingested project artifact | Pass | Corpus ingest and keyword/semantic recall returned the written marker with its project-root source path. |
| Delegate bounded work | Pass | One parent call spawned one worker; the worker read the README and returned the required result in 2 parent iterations. |
| Use the packaged desktop chat | Pass | The notarized v0.8.0 app called `read_file` and returned `VANTA_DESKTOP_CHAT_OK` in 2 iterations; the notarized v0.9.3 package completed the current packaged work flow, and v0.9.4 adds a cold-start regression gate over the same desktop surface. |
| Block a destructive desktop command | Pass | The packaged desktop rejected `rm -rf / --no-preserve-root` at the kernel boundary. |
| Run an unattended schedule | Pass | A clean `~/vanta` install launched through launchd, fired a provider-free task (`VANTA_SCHEDULE_OK`), then completed a real Codex agent task (`VANTA_SERVICE_AGENT_OK`). Temporary tasks were removed; the service and 9 AM greeting remain active. |
| Report cold-start capabilities | Pass | `general-capability-start` inspected doctor, activation, backend, channels, keybindings, Run Anywhere, and A2A state; it separated ready and setup-required workflows before action. |
| Produce cited research | Pass | `research-cited-synthesis` used two bounded decomposition workers, search, and three primary-source fetches; it returned a cited skeptic pass with explicit uncertainty in 176 seconds. |

The use-case catalog currently records 6 executed and 6 passed scenarios across 6 of 15 categories. The remaining categories are coverage gaps, not failures.

## Regression gates

- TypeScript: 1,434 test files; 13,505 passed and 3 skipped.
- Rust kernel: 70 passed.
- TypeScript typecheck and architectural boundaries: passed.
- Production desktop renderer build: passed.
- Desktop visual proof: 36 Ghost light/dark captures passed across three supported widths.
- Packaged performance proof: cold-start median plus per-sample hard ceiling, first-use, memory, CPU, and package-size budgets passed.
- Production npm audit: 0 vulnerabilities.
- External `terminal-love` MCP: 94 tests passed and 0 production vulnerabilities after its Undici update.

## Release boundary

The public [v0.9.4 desktop artifact](https://github.com/jpoindexter/Vanta/releases/tag/v0.9.4) binds the desktop cold-start repair to one tagged commit and checksum. Apple accepted notarization submission `374f7536-59ba-4657-a437-b6d151d81445`; the stapled DMG passed local Gatekeeper as `Notarized Developer ID` and has SHA-256 `f9556698e3a5bc5b2b5679f919238f924c19b366c366b2122aa8324a9eb301a3`. The exact public artifact is submitted to the clean-Mac Gatekeeper workflow after publication. The previous public v0.9.2 artifact passed that same independent download-and-quarantine gate in [run 29249460403](https://github.com/jpoindexter/Vanta/actions/runs/29249460403).

Provider credentials, physical devices, and third-party accounts remain separate external gates. Run `vanta roadmap proof-status` for the exact ten parked proofs.

## Reproduce

```bash
node scripts/usecase-eval.mjs --validate
node scripts/usecase-eval.mjs --status --json
node scripts/usecase-eval.mjs --id general-capability-start --run
node scripts/usecase-eval.mjs --id research-cited-synthesis --run --timeout-ms 300000
cd vanta-ts && npm test
cargo test
```
