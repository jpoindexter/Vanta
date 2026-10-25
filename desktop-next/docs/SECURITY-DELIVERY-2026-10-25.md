# Installed security candidate — 2026-10-25

## Gap first

Dependency fixes are installed. Full Desktop acceptance is not established:
the split-Find replay exposed a queued-focus timing race despite a passing
diagnostic replay. Its source correction has a separate acceptance record.
Owner visual/parity, normal-account/profile, hardware/VoiceOver and human gates
remain. Security is not green; broad cards and the full goal remain open.

## Exact delivered build

- `/Applications/Vanta.app`, source `f94c5025d161fc1d472ce51ec5ae42286daea1f3`,
  version `0.1.0-local.20261025.security`.
- Installed executable/modules: Electron43.8.1 / Node24.22.0,
  Nodemailer10.2.1, Capacitor core/iOS8.5.3.
- Developer ID signed. Apple submission
  `78c1d05e-a590-431d-b7a3-2fe6df60e842` Accepted; ticket stapled/validated;
  installed deep/strict signature and Gatekeeper checks pass.
- Installed/candidate ASAR SHA256:
  `12a129d6a8f17d352c3fb6fe7cbf45d39b2dc289c75330dbca1befa357b8874d`.
- Local post-staple198MiB ZIP:
  `/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-deliveries/2026-10-25/Vanta-0.1.0-local.20261025-security-notarized-arm64.zip`.
  SHA256 `9ee28ba8dfdb3609d1abf52e3a0347b05ba3f74f75fb8b3392cfd16cb072ef4f`.
  No public release asset, tag or main merge.

## Executed evidence

Actual installed executable:13-step/seven-probe done-path passes with private
HOME/VANTA_HOME/userData, two throwaway projects, packaged runtime/kernel and
a loopback scripted model. Cold restart, same-project Always persistence,
cross-project isolation, Plan write refusal, irreversible-action prompts,
200KB text/image paste and1440/1100/800 layouts pass. One navigator.vibrate
warning; no runtime exception. Permission query is not microphone recording.

Installed Nodemailer stream transport generates only the intended recipient
for the advisory case: no SMTP/DNS/credential or email delivery. Receipts:
[done-path](proofs/security-delivery-2026-10-25/installed/result.json),
[runtime](proofs/security-delivery-2026-10-25/installed/runtime-versions.json),
[recipient](proofs/security-delivery-2026-10-25/installed/recipient.json),
[Apple](proofs/security-delivery-2026-10-25/installed/notarization.txt).

Find: first run stopped opening a submenu through hover in the off-screen,
click-through harness. Keyboard ArrowRight opens the same submenu. That run
passed21 assertions, then captured the first pane after menu focus. Diagnostic
replay passed27 assertions/two requests/zero renderer errors; it does not erase
the failure. Both reports are under `proofs/security-delivery-2026-10-25/find-before/`.
The queued callback resolved document.activeElement too late. A deterministic
regression reproduces this; source remediation is separate from this installed
build. No claim of installed Find-timing acceptance yet.

## Preservation and next work

The idle f5b12a97 app was staged/validated, then renamed, not deleted, into
private recovery `Vanta-backups/electron43-checkpoint-20261025-NEcwhD/replaced-Vanta.app`.
Copied prior userData, prior app copy, verified complete-history bundles,
remaining binary patch and untracked archive remain. Normal owner profile
was not opened; CLI runtime/source and launcher target unchanged.

Runtime production audit:6 findings (0critical/5high/1moderate), not zero.
Desktop/website and default-branch alerts are separate. Next: finish Find timing
delivery, truthful mail failure receipts and compatible dependency batches,
then proven modular seams. No legacy retirement before parity approval.
