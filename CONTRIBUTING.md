# Contributing to Vanta

Thanks for your interest. Vanta is a local, trusted-operator AI agent — a Rust safety
kernel that enforces the boundary, and a TypeScript agent loop that gates every action
through it. Contributions are welcome, from typo fixes to new adapters.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **git**, **Rust** (stable), **Node 22+**

## Setup

```bash
git clone https://github.com/jpoindexter/Vanta.git
cd Vanta
./install.sh          # builds the kernel, installs deps, puts `vanta` on your PATH
# or, just the agent layer:
cd vanta-ts && npm install
```

## Layout

| Path | What |
|------|------|
| `src/` | **`vanta-kernel`** — Rust, zero-dependency. The enforced security boundary: risk classifier, approvals, goals, events, HTTP sidecar. |
| `vanta-ts/` | **`vanta`** — TypeScript agent loop: LLM providers, tools, prompt. Gates every action through the kernel. |
| `docs/` | PRD, architecture, design notes. |

The kernel is the boundary — `assess()` is a gate, not a suggestion. The TS layer
orchestrates but **cannot bypass the kernel**. Keep it that way.

## Run it

```bash
./run.sh                       # interactive session
./run.sh run "<instruction>"   # one-shot
./run.sh doctor                # health check
```

## Before you open a PR — the bar

Run these from the right directory and make sure they're green:

```bash
cargo test                                  # kernel tests (from repo root)
cd vanta-ts && npm test                     # agent tests — RUN FROM vanta-ts/, not the repo root
cd vanta-ts && npm run typecheck            # tsc --noEmit, must be clean
cd vanta-ts && npx vanta lint --staged      # size gate (also runs as a pre-commit hook)
```

> ⚠️ Run the TS test suite from `vanta-ts/`, **not** the repo root — the root config also
> scans bundled reference repos and reports spurious failures.

### Code standards (enforced)

- **Size gate** (blocks the commit): files ≤ 300 lines, functions ≤ 50, params ≤ 4
  (else an options object), cyclomatic complexity ≤ 10.
- **TypeScript**: ESM only (`.js` import extensions), `strict`, no `any` (use `unknown` +
  narrowing), **zod at every boundary** (API/env/external/file parse).
- **Errors as values** in tools (`{ ok, ... }`) — don't throw across boundaries.
- **No secrets** committed, logged, or echoed. `.env` is gitignored; document keys in
  `.env.example`.
- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- Tests live next to the code (`foo.ts` + `foo.test.ts`); no test = no merge.

## Pull requests

1. Branch off `main` (`feat/…`, `fix/…`).
2. Make the change + add/adjust tests.
3. Ensure tests, typecheck, and the size gate are all green.
4. Open a PR — the template will prompt you for the checklist.

## Where to start

- Issues labelled **good first issue** or **help wanted**.
- `roadmap.json` — open cards (`status: next` / `horizon`).
- New messaging adapters follow the `PlatformAdapter` pattern in
  `vanta-ts/src/gateway/platforms/` (mirror `line.ts` — pure parse/build + injected
  transport + allowlist + tests).

## Security

Found a vulnerability? **Don't open a public issue** — see [SECURITY.md](SECURITY.md) for
private reporting.

## License

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).
