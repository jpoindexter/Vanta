# Shell inventory: Claude desktop vs Vanta (2026-10-22)

Scope: what the Electron shell declares (bundle plist, entitlements, file layout). Black-box feature graph only. No code, strings, prompts or assets copied into Vanta; Vanta builds each feature itself. Claude desktop 3.1623.4, `com.anthropic.claudefordesktop`. License terms of that app not checked.

Not covered yet: menus, tray, window behaviour, updater, deep-link handling, IPC surface. Those need the app observed running (REA `capture_electron_scenario`), not read from source.

## Declared surface

| Capability | Claude desktop | Vanta (installed build 5) |
|---|---|---|
| URL scheme | `claude` | `vanta` |
| Apple Events (control other apps) | yes, with usage string | yes |
| Microphone | yes (dictation) | yes (voice) |
| Camera | yes | yes |
| Screen capture usage string | none declared | yes |
| Bluetooth, USB | entitled | no |
| Location, Photos library | entitled | no |
| Print | entitled | no |
| Virtualization | entitled | no |
| Keychain groups | webauthn, hwkey, Microsoft identity/workplace join | none |
| ASAR integrity | `ElectronAsarIntegrity` hash in plist | not set (unverified) |
| JIT / unsigned memory | JIT only | JIT + unsigned executable memory |
| Layout | `.vite` build, `compile-cache`, 48 MB asar | not compared |

## Candidate gaps (ranked smallest first; none committed)

1. ASAR integrity plus Electron fuses: cheap hardening. Check Vanta's current fuses first with REA `inspect_electron_fuses`.
2. Drop `allow-unsigned-executable-memory` if nothing needs it (Vanta asks for more than Claude does). Needs a packaged-app test.
3. Virtualization entitlement: would let agents run in a VM sandbox. Large. Vanta's boundary today is the kernel sandbox (SECURITY.md); a VM is a separate decision.
4. Location, Photos, Bluetooth, USB, print, hardware-key auth: no Vanta feature needs them yet. Park.

Parked per anti-drift rules; promote only with a Vanta feature that needs one.

## Next step if wanted

Launch Claude desktop under REA `capture_electron_scenario` and record menu structure, tray items, window sizes and states, and deep-link routes as a behaviour list. Time-box: 5 tool calls.
