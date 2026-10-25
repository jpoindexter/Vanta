# Desktop Vitest security patch — 2026-10-25

Desktop development-only Vitest/mocker4.1.10→4.1.12. Exactly the owner pin and
eight existing installed Vitest-family lock entries change; no new package,
override or unrelated dependency. Runtime Vitest3 remains unchanged.

Official [4.1.12 release](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12)
backports [manual-source registration hardening](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8).
The preceding [redirect boundary fix](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)
is included. Optional webdriverio peer metadata changes to official^4.1.11;
no webdriverio/browser package is added.

## Executed, not inferred

- Public createManualModuleSource serializes URL/export text rather than
  interpolating it. Public interceptorPlugin refuses an outside-fs.allow
  redirect. Both regressions fail on4.1.10; three security/control cases pass
  on4.1.12. Generated text is not evaluated; no outside-file read, real server,
  listener or exploit is run. Current Vanta config does not expose that plugin.
- Isolated18UI+60native representative consumer tests pass. Parent27transcript
  cases pass under actual4.1.12. Renderer/Electron typechecks are separate gates.
- Clean npm ci --ignore-scripts succeeds in isolated candidate and parent;
  actual installed versions are4.1.12. The initial parent test command used
  the workspace root, which has no ui project; rerun from apps/desktop passes.
- Audit28→26:0critical/14high/4moderate/8low. Only Vitest/mocker findings removed;
  audit still exits1. Evidence proofs/vitest-security-2026-10-25/audit.json.
- npm10.9.8 signature/attestation verification for apps/desktop exits0 with
  invalid[]/missing[] in isolated candidate; receipt beside audit. This is
  not source-code benignness or whole dependency-security acceptance.

Normal npm resolution/lock-only attempts encountered inherited edgesOut errors.
Only the eight exact package records were refreshed from official registry
metadata, asserting dependency/peer/engine/bin relationships, then verified by
clean npm ci. This does not repair the npm resolver or phantom workspace metadata.

No full suite, real remote dev-server exploit, fresh package/install, Rust/Python,
GitHub default-branch remediation, main merge/release or paid/CI action claimed.
Installed745629c6 identity is unchanged by this development dependency patch.
