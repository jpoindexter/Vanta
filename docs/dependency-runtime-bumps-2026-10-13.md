# Dependency runtime bumps, 2026-10-13

Scope: shipped-runtime Dependabot alerts only (vanta-ts). Lockfile-minimal; no `npm audit fix`.

| Package | Before | After | Notes |
|---|---|---|---|
| electron | 43.4.0 (`^43.1.0`) | 43.5.1 (`^43.5.1`) | Fix floor 43.5.0 (alerts 128-131). 43.5.1 adds contextBridge crash fixes. Same major; no breaking changes. |
| nodemailer | 9.0.1 | 10.0.13 | Fix floor 10.0.6. Only breaking change in 10.0.0 is Node 20+ (repo is Node 22). Usage: `createTransport` + `sendMail` in `src/gateway/platforms/email-transport.ts`. |
| imapflow | 1.4.2 | 1.7.8 | 1.7.x no longer depends on nodemailer, so no nested vulnerable nodemailer 9.0.1 remains. Usage: `ImapFlow`, `connect`, `getMailboxLock`, `fetchAll`, `messageFlagsAdd`, `logout`; no API changes in changelog. |
| brace-expansion | 1.1.18 / 2.1.4 / 5.0.9 | 1.1.21 / 2.1.7 / 5.0.12 | `npm update brace-expansion`; lock entries only. |
| ip-address (override) | 10.4.0 | 10.7.4 | Override in `package.json`; fix floor 10.7.1. Consumer is `socks` (`^10.1.1`). |
| capacitor-swift-pm (iOS) | 8.4.1 | 8.5.0 | `ios/App/CapApp-SPM/Package.swift` and the Xcode workspace `Package.resolved` (revision 4f71d0b9...; 8.5.0 is a lightweight tag, so the tag SHA is the commit). Matches npm `@capacitor/ios` 8.5.0. |

Verification gaps:
- SwiftPM resolution is unverified: `swift package resolve` fails in this environment (CLT missing BuildServerProtocol.framework). `originHash` in `Package.resolved` is unchanged and will be rewritten by Xcode on the next resolve.
- Electron GUI, `desktop:pack`, and packaged-origin smoke were not run.
- http-cache-semantics (alerts 168/169) has no patched release.
- vanta-website lockfile untouched.
