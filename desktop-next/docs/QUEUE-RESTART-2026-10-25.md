# Installed queue restart check — 2026-10-25

## Result and boundary

The independent queue journey passed all seven steps on the installed
`/Applications/Vanta.app`, source `510e0450`, with its bundled runtime/kernel.
Before/after ASAR SHA-256:
`0e8461b1382691a5033cd7f57a6539ec33d364b504f6a1cd80a35e124ea00a4a`.

The full receipts-and-queue journey did **not** pass: Retry and Start from
checkpoint passed; Edit request failed because the third failure card had no
visible recovery controls. Queue steps were not reached in that run. The
separate queue result does not change or hide that failure.

## Executed queue path

Using the existing runner's new explicit `--only queue` selector:

```sh
VANTA_PACKAGED_APP=/Applications/Vanta.app \
  node tools/receipts-queue-proof/run.mjs --only queue --out <private-output> --keep
```

- Start a held response and queue three messages through the composer.
- Edit the middle message, move the last earlier, remove the first.
- Close and relaunch with the same private profile; two queued messages remain.
- Observe zero automatically replayed queued requests.
- Click Run queue; the model receives `echo charlie` then `echo bravo edited`,
  exactly once each, and the queue empties.
- Restart again; the two messages and answers retain their order.
- Zero renderer console errors were recorded.

The result retains the scripted model's three-request ledger. Private HOME,
VANTA_HOME, userData, projects and loopback ports separate this from owner data.
The harness instruments Electron visibility/focus to avoid covering the owner's
screen; this is packaged-shell behaviour, not native-focus acceptance.

## Retained evidence

External backup root:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/`.

- `queue-acceptance-20261025-bHs3DS/result.json`: full-run failure, a1/a2 pass,
  a3 fail, b1–b7 skipped; `FAIL-a3.png` shows the missing controls.
- `queue-only-20261025-GgGJjH/result.json`: independent b1–b7 pass, model ledger
  and screenshots. Its sandbox remains available under the recorded private
  path. No owner data or real provider was used.

Runner default remains the full journey. Unknown `--only` values reject before
sandbox creation or app launch; syntax and that rejection were executed. New
failure records retain the complete error stack instead of truncating the
Playwright call log. The original failed receipt is preserved as emitted, not
retroactively upgraded.

## Still open

The follow-on source correction now passes the full10step recovery/queue path;
see COMPOSER-RECOVERY-2026-10-25.md. That does not retroactively change the
installed510e0450failure above or establish installed acceptance of the new code.

Unsent image cold-restart custody, multi-chat unread/reading-position recovery,
the third failure's missing recovery actions, complete ordinary-chat continuity,
real account/hardware/owner-profile and human acceptance are not established by
this check. No app binary, owner profile, authority, roadmap status or Done
criterion was changed to obtain the independent queue result.
