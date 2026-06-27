# Beta readiness — live-proof record

_Generated 2026-06-21. All headless-provable paths green._

> **Two senses of "ready" — don't conflate.** This doc = **live-proof readiness** (does it install & run on a clean box, are channels live). The **competitive reliability bar** ("ready like a serious agent harness" = reliably finishing real multi-step tasks unattended, _measured_) lives in STRATEGY.md §"The readiness bar" + DECISIONS 2026-06-26. Feature count is neither.

## Proven on this machine
- ✅ **Does a real task** — a provider is configured: gpt-5.5
- ✅ **Efficient multi-step work** — 3 tools ran in one turn; only the final result returned (true)
- ✅ **Safe by default** — kernel verdict for 'rm -rf /' = block (expect block)

## Still gated — need live setup (run on a clean machine with these)
- 🟡 **Install → working session** — install + kernel build + global launcher + `doctor` **VERIFIED on a clean Linux box** (Docker `node:22`, no toolchain, pristine `git archive`; `install.sh` exit 0, global `vanta` on PATH, 87 skills seeded, 62 kernel tests green — 2026-06-22). Remaining: a real LLM *turn* on that fresh box needs a provider key (the turn itself is proven on the dev box above), and the public-repo `curl | bash` one-liner needs the repo flipped public.
- 🔒 **Reaches you on a channel** — needs: a channel token (5 of 20 adapters live-verified; rest need creds)
- 🔒 **Images + voice in a channel** — needs: a channel token + the whisper CLI
- 🔒 **Runs a scheduled job unattended** — needs: a configured channel + the OS scheduler

> The gated paths are real code, offline-tested; they need the listed token/account/machine to be verified live.

> **Install hardened 2026-06-22:** the user install is now `npm install --omit=dev` (`tsx`/`typescript` moved to runtime deps, since the app runs via `tsx` and the size-gate/LSP use the TS compiler API). Testers no longer pull the `vitest`/`vite` test toolchain — production `npm audit` dropped from **1 critical + 1 high + 3 moderate → 1 low** (an esbuild dev-server advisory via `tsx`, not exercised at runtime), and `install.sh` no longer prints a scary vulnerability summary.
