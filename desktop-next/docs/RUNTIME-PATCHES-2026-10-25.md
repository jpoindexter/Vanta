# Runtime dependency security patches — 2026-10-25

## Gap first

Source acceptance until the combined Electron/runtime candidate is packaged
and installed. Other security/trust/modularization work remains; no whole-card
closure, external mail test or native iOS-device acceptance is claimed.

## Reproduced and changed

Nodemailer10.0.13 generated the wrong recipient envelope for the upstream
advisory's nested-comment input. The proof used the public createTransport /
sendMail API with an in-memory stream transport: no SMTP connection, DNS lookup,
credential or email delivery. The new one-case regression failed on10.0.13 and
passes on10.2.1: the envelope now contains only v@victim.test, not evil@evil.test.
This proves the parser/envelope case, not delivery or the entire email workflow.
[Upstream advisory](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8c8m-p3m8-cjg8).

Capacitor core/iOS minimums move from ^8.4.1 to ^8.5.1, resolving both to8.5.3.
The compatible range retains mobile support, rather than hiding or deleting the
iOS dependency to reduce audit counts. The
[upstream proxy-origin advisory](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv)
lists8.5.1 as patched for the previously installed8.5.0 line. No native iOS
binary was rebuilt, synchronized to a device, signed or distributed here.

Only these three installed package versions change in the runtime lock. No
forced audit-fix, major provider/schema upgrade, policy weakening, dependency
allowlist, account configuration or permission change.

## Executed evidence

- New real Nodemailer in-memory recipient regression: red before / green after.
- Existing email adapter38tests and companion client5tests pass (43total).
  Adapter mocks and error-as-value tests do not prove external mail delivery.
- Fresh production audit8→6:0critical,5high,1moderate. Capacitor iOS and
  Nodemailer no longer reported. Full runtime18→16:2critical,12high,2moderate;
  the remaining criticals are test-tool dependencies, not silently accepted.
- Electron remains43.8.1 in both manifests/locks; its version agreement check
  still passes. The earlier Electron-only package was Apple Accepted and its
  packaged criterion passed13steps/seven probes, but it is not installed: the
  combined candidate must include these runtime fixes before replacement.
- Combined signed package f94c5025, version0.1.0-local.20261025.security, contains
  Electron43.8.1, Nodemailer10.2.1 and Capacitor core/iOS8.5.3. Running the
  package's own executable in RunAsNode mode, with createRequire pointed at
  Resources/vanta-runtime/package.json, generates only the intended recipient.
  This executes shipped modules, not the working tree dependency copy. It is
  still an in-memory stream, not live email. Receipt:
  proofs/runtime-patches-2026-10-25/shipped-recipient.json.
  Apple submission is currently in progress; installation not yet claimed.

Whole-runtime and classic-renderer typechecks exit0. Exact combined build
identity is added after packaging/installation. Keep original work and rollback
archives, and verify the exact final installed closure. Owner visual/parity,
normal-account, hardware/VoiceOver and unfamiliar-person gates remain.

Separate trust follow-up (code-path observation, not a reproduced external
incident): email-transport.ts sendSmtp catches failures and returns undefined.
Its existing tests deliberately expect this; they must not be cited as proof
of delivery. Reproduce failure disposition through the adapter/receipt before
changing that contract, and never test it by sending owner mail without fresh
authority.
