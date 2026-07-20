# Product acceptance

Updated 2026-07-20. This record separates executed behavior from static tests and external setup gates.

## Executed operator paths

| Story | Result | Evidence |
|---|---|---|
| Read a project file with a real model | Pass | `read_file` returned the README heading and the model returned the exact acceptance marker in 2 iterations. |
| Write and read back a file | Pass | The model wrote `.vanta/eval-runs/product-acceptance/model-write.txt`, read it back, and returned the exact marker in 3 iterations. |
| Recall an ingested project artifact | Pass | Corpus ingest and keyword/semantic recall returned the written marker with its project-root source path. |
| Delegate bounded work | Pass | One parent call spawned one worker; the worker read the README and returned the required result in 2 parent iterations. |
| Use the packaged desktop chat | Pass | The notarized v0.8.0 app called `read_file` and returned `VANTA_DESKTOP_CHAT_OK` in 2 iterations; v0.9.5 passes the current source-plus-packaged work, recovery, Connect, attachments, long-session, queue, and responsive flow suite. |
| Block a destructive desktop command | Pass | The packaged desktop rejected `rm -rf / --no-preserve-root` at the kernel boundary. |
| Run an unattended schedule | Pass | A clean `~/vanta` install launched through launchd, fired a provider-free task (`VANTA_SCHEDULE_OK`), then completed a real Codex agent task (`VANTA_SERVICE_AGENT_OK`). Temporary tasks were removed; the service and 9 AM greeting remain active. |
| Report cold-start capabilities | Pass | `general-capability-start` inspected doctor, activation, backend, channels, keybindings, Run Anywhere, and A2A state; it separated ready and setup-required workflows before action. |
| Produce cited research | Pass | `research-cited-synthesis` used two bounded decomposition workers, search, and three primary-source fetches; it returned a cited skeptic pass with explicit uncertainty in 176 seconds. |
| Capture and inspect the screen | Pass | The CLI/TUI captured a real 3024x1964 Retina screen and a visual model returned the required `SIGHT_OK landscape` marker. Area, window, and all-display capture contracts also passed focused Desktop smoke coverage. |
| Paste image context into Desktop | Pass | The Electron native clipboard bridge ingested text, PNG, and mixed clipboard content; Desktop rendered a removable chip, retained it after failed send, submitted it on success, and then cleared it. |

The use-case catalog currently records 6 executed and 6 passed scenarios across 6 of 15 categories. The remaining categories are coverage gaps, not failures.

## Regression gates

- TypeScript: 1,456 test files; 13,584 passed and 3 skipped.
- Rust kernel: 70 passed.
- TypeScript typecheck and architectural boundaries: passed.
- Production desktop renderer build: passed.
- Desktop visual proof: 36 Ghost light/dark captures passed across three supported widths.
- Packaged performance proof: cold-start median plus per-sample hard ceiling, first-use, memory, CPU, and package-size budgets passed.
- Production npm audit: 0 vulnerabilities.
- External `terminal-love` MCP: 94 tests passed and 0 production vulnerabilities after its Undici update.

## Release boundary

The public [v0.9.5 desktop artifact](https://github.com/jpoindexter/Vanta/releases/tag/v0.9.5) binds Sight, image clipboard context, graph engineering v1, and the current desktop flow suite to tag commit `4018dd64`. Apple accepted notarization submission `efcb15b4-60f0-4d0f-b5e6-a4d602d796e2`; the DMG has SHA-256 `b1c97ecd59bc8c37a6d2c843e81d4a74f44c75cf4a7f9bdb8a0e46594554f122`. Local verification passed checksum, staple, DMG signature, mounted app signature, embedded-kernel signature, and Gatekeeper assessment. The exact GitHub-downloaded artifact then passed checksum, staple, signature, quarantine, and Gatekeeper verification on a clean hosted Mac in [run 29777875809](https://github.com/jpoindexter/Vanta/actions/runs/29777875809).

The CLI/TUI visual answer is executed. The signed app's capture contracts are executed under automation, but a successful visual-model answer from that packaged bundle remains an external proof until macOS Screen Recording permission is granted to `studio.theft.vanta`. The clipboard proof exercises Electron's native clipboard bridge and the renderer paste path; it does not establish macOS Command-V keyboard delivery.

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
