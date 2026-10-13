# Vanta dependency security triage, 2026-10-13 (read-only)

Method tags: [EXEC] ran and observed; [INFER] reasoned from code/config, not run.

## 1. Open Dependabot alerts (default branch main = 4911ae44) [EXEC gh api]
- Total 151: critical 1, high 80, medium 59, low 11 (matches expectation).
- Manifest: vanta-ts/package-lock.json 82, vanta-ts/package.json 9, vanta-website/package-lock.json 60.
- Scope label: runtime 100, development 51. Dependabot "runtime" is NOT shipped-runtime: vanta-website is a Docusaurus build; electron is a devDependency but is the shipped Electron framework.
- vanta-ts 91 (1 crit, 51 high, 36 med... see chk.json), vanta-website 60 (29 high, 23 med, 8 low).

## 2. Critical #173 @capacitor/ios (GHSA-rvm3-566m-v7fv, CVSS 9.3, UI:R, range >=8.3.5 <8.4.3)
- Bug lives in the native iOS WebView navigation guard (Swift), not JS. [advisory text]
- Electron/CLI: not reachable. @capacitor/ios npm files (112 Swift/native files) are packed inertly in installed /Applications/Vanta.app 0.9.8 app.asar (ios 8.5.0, core 8.5.0) [EXEC asar list]; Electron never runs the Swift guard. @capacitor/core JS is bundled in renderer (companion-client.ts Capacitor.isNativePlatform) but is not the vulnerable code.
- iOS shell: vanta-ts/ios + capacitor.config.ts, commits 2a5f6582 "Add native iOS companion shell" and 7652d77d "Ship native mobile companion" (2026-07-10). No TestFlight/App Store distribution evidence in repo markdown [EXEC rg]; whether a device build exists is UNKNOWN.
- Native pin is the real exposure: ios/App/CapApp-SPM/Package.swift `capacitor-swift-pm exact "8.4.1"`; Package.resolved pins 8.4.1 [EXEC read] = inside vulnerable range. HEAD npm lock is already 8.5.0, so a Dependabot rescan of HEAD would close the alert while the native pin stays vulnerable. PR #62 changes only package.json + lock (gh files list), so it would not fix SPM pin either. Fix = bump npm >=8.4.3 AND `npm run mobile:sync` (cap sync ios) so Package.swift/Package.resolved move; verify by grep. [INFER that cap sync regenerates the pin]
- Exploit prerequisite: user taps a link inside the WebView with attacker-influenced content (chat output). Not verified that the companion renders links.
- Priority: cheap, do it in the same lock PR, but NOT a blocker for the desktop release. Blocker for any iOS distribution.

## 3. Top 10 high by shipped reachability
Evidence: installed asar has 272 packages; of vanta-ts alert packages only @capacitor/ios, brace-expansion, ip-address, nodemailer are inside. Absent: xmldom, adm-zip, electron(js), fast-uri, http-cache-semantics, js-yaml, pdfjs-dist, postcss, sharp, undici, vitest. electron-builder files exclude adm-zip, sharp.
1. Electron 43.4.0 (#128-131; fix 43.5.0/43.4.1). Framework CFBundleVersion 43.4.0 in installed app [EXEC]. main.mjs: sandbox true, contextIsolation true, nodeIntegration false, window-open denied; no <webview> found [EXEC rg]. Real shipped runtime; exploitability moderate-low.
2. nodemailer 9.0.1 (#108/109/166/167; fix 10.0.6; 9.1.0 for older pair). In asar [EXEC]; used by gateway/platforms/email*.ts. ReDoS on address parsing.
3. brace-expansion 2.1.4 via readdir-glob (#170/#172; fix 2.1.5/2.1.6). In asar. DoS needs attacker-controlled glob.
4. pdfjs-dist 6.0.227 (#50/#51, arbitrary JS on malicious PDF). Prod dep on main; REMOVED on HEAD (pdf-read.ts uses @firecrawl/anydoc), absent from installed asar. Reachable only in main-built artifacts. Highest impact class if main is ever shipped.
5. adm-zip 0.6.0 (#1,121,156,157,159). Optional dep, excluded from desktop package; CLI/source installs only.
6. sharp 0.35.3 (#2/#116). Optional, excluded from package.
7. undici 7.29.0 (#14/#132, TLS bypass fix 7.29.1). dev/optional; not in asar.
8. ip-address (#24): main 10.2.0 vulnerable; HEAD/installed 10.4.0 not.
9. fast-uri, js-yaml, postcss, xmldom (build/dev chain, electron-builder -> xmldom): build-only.
10. http-cache-semantics #168/#169: NO patched version exists; dev/website only.
Website (29 high): build-time Docusaurus -> static Cloudflare Pages; not shipped runtime. [INFER]

## 4. Existing remediation
- Open Dependabot PRs: 21 (#38-#43,#45-#55,#57,#58,#61,#62), all base main, GitHub mergeable individually. Branches not fetched locally; cross-conflict not tested [INFER heavy lock overlap with #56].
- #56 codex/dependency-security-20260930 (5abbb649): 1 commit on main 4911ae44, draft, GitHub Actions disabled. Bumps imapflow 1.7.8, nodemailer 10.0.13, pdfjs-dist 6.3.289, electron ^43.7.7, vitest 4.1.11 (major 3->4), website lodash-es; fixes tests, adds scripts/dependency-security-check.mjs. Claims 115 alerts closed, local gates green (author-reported, not re-run by me).
- My mechanical check [EXEC: lock versions vs each alert's vulnerable range, script scratchpad/chk.py]: main fixes 0/151 (sanity ok); #56 branch lock leaves 3 of 151: #173 capacitor (8.4.1), #168/#169 http-cache-semantics (no patch). HEAD 92ee5c86 lock already clears 64, leaves 87 (33 high ts, 11 high web). This is lock-range matching, not npm audit.
- merge-tree #56 onto main: clean (exit 0). Onto HEAD 92ee5c86: CONFLICTS in 8 files: README.md, vanta-ts/package.json, vanta-ts/package-lock.json, vanta-website/package.json, vanta-website/package-lock.json, vanta-ts/src/tools/pdf-read.ts, src/cli/termux-install.test.ts, src/tools/use-case-catalog.test.ts. HEAD diverged: pdfjs-dist removed for anydoc, typescript aliased to @typescript/typescript6 + @typescript/native (TS7), electron packaging adds extraResources for @typescript/native, website overrides fast-uri 3.1.5/undici 7.29.0.
- Compat risks: #56 tested on main base (typescript ^5.8, 1,459 test files); HEAD stack has TS6/7 and 1,583 files. TS7 evidence: docs record `npm run typescript:compat:test` 1/1 pass (2026-08..10-02) but only on stack. vitest 4 + TS6/7 + electron 43.7.7 combo unproven. Electron 43.4.0 -> 43.7.7 is minor/patch within 43 (low risk, packaged-origin smoke needed).
- Branch/PR #56 cannot close default-branch alerts until merged into main and rescanned.

## 5. Ordered plan
1. Carry only the shipped-runtime bumps first: electron ^43.7.7 (or >=43.5.0), nodemailer >=10.0.6 (10.0.13), imapflow 1.7.8. Proof: npm ci; typecheck runtime+renderer; `npm run typescript:compat:test`; email-transport integration test; `npm run desktop:build`; `desktop:pack` + `desktop-local-origin-security-smoke` + `desktop:trust-02:proof`; installed-asar package listing re-check.
2. Land #56 on main as its own PR (clean there). Drop pdfjs-dist bump conflict when re-carrying to stack. Proof: its documented gates incl. `node scripts/dependency-security-check.mjs`, full vitest, website build.
3. Capacitor: bump >=8.4.3 and `npm run mobile:sync`; proof: Package.swift/Package.resolved show >=8.4.3. No iOS distribution before this.
4. Website-only Dependabot PRs (#40-43,#46-53) are superseded by #56 lock; close after #56 merge (needs owner authorization).
5. Re-scan after merge to main; http-cache-semantics has no fix: track, dismiss only with owner approval and written rationale.
