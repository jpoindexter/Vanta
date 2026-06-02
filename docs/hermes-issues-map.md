# Hermes issues → Argo opportunities (manifesto-aligned) — 2026-06-02

Reviewed NousResearch/hermes-agent open issues (~200). Most are Hermes-specific
(Desktop app, Windows, Telegram/Discord gateway, plugins, localization) and don't
apply. Below: what maps to Argo's architecture + manifesto.

## 🔴 SECURITY — Argo currently REPLICATES these Hermes holes (manifesto-critical)

Argo's manifesto hard line #2: *"Safety enforced, not advisory. The Rust kernel is
the boundary. Blocked means blocked."* The Hermes security issues show this is the
hardest thing to get right — and **Argo's kernel currently fails the same way.**

- **#36846 (denylist bypassable by shell escapes → silent RCE)** — Argo's `assess_action`
  (src/safety.rs) is a `has_any(text, ["rm -rf","delete",…])` substring match on the
  command *description*. Bypassed by `python3 -c "shutil.rmtree(...)"` (no keyword),
  `rm  -rf` (double space), `rm -r -f`, base64|sh, `$(…)`. **Default verdict is Allow.**
  → FIX: stop pretending a keyword denylist is a boundary. Route interpreters / eval /
  piped-to-shell / absolute-path writes to **ask** (approval), normalize whitespace,
  broaden destructive detection (`rmtree`, `unlink`, `dd`, `mkfs`, `> /dev`, fork-bomb).
- **#36645 (execute_code bypasses write-safe-root)** — Argo's `shell_cmd`/`run_code` run
  with `cwd: root` but nothing stops `cd /tmp && …` or `open('/abs/path','w')`. Only
  Argo's *native* file tools use `resolveInScope`; shell does not. Same hole.
  → FIX: shell/exec that references absolute paths outside root or an interpreter → ask.
  Honest note: true containment needs a sandbox (Hermes' answer is OpenShell); the
  kernel hardening reduces the trivial-bypass surface and shifts power ops to approval.
- **#37617 (prompt-injected writes to inactive-profile credential files)** — Argo writes
  `~/.codex/auth.json` (0600) and `~/.argo`. → verify no tool can write to credential
  paths without approval (the kernel's `credential`/`token` → ask helps; confirm it
  covers `auth.json`/`.credentials`).
- **#37258 harden browser subprocess env**, **#36646 archive extracted w/o path validation**
  — lower priority; relevant to Argo's browser + skills-install paths.

## 🟢 FEATURES worth implementing (manifesto-aligned)

- **#37184 Can't remove a pasted image** — Argo just shipped `/image`+`/paste`+drag-drop.
  Don't replicate the bug: add `/clear-attachments` (+ make `/undo`/`/clear` drop pending
  images) and show a pending-attachment count. ★ cheap, do now.
- **#36821 `/plan` to view the todo list** — Argo has NO in-session todo tool. Add a `todo`
  tool + `/plan` to view it. Pairs with v1.2 U6. Manifesto: goal-first/verified. ★★
- **#36656 Volatile skills (load for one turn only)** — Argo injects the skill index +
  `recall` loads a body into history (persists → context bloat). Add a `volatile` frontmatter
  flag so a recalled body is dropped after the turn. Manifesto: learns + lean context. ★★
- **#37352 `argo skills lint`** — validate SKILL.md frontmatter, `related_skills`, name↔dir.
  Argo's curator archives stale skills; a lint catches structural rot. ★ self-contained.
- **#37227 Category-aware skill indexing + lazy load** — refine Argo's index (group by
  category, surface fewer at once). Builds on the P3 index work. ★
- **#37070 Agent unaware of its own cron-job output** — Argo has cron + gateway; cron
  deliveries should re-enter the session transcript so the next turn can reason about them.
  Manifesto: operator continuity. ★★
- **#37569 `/council` multi-model deliberation (3-stage)** — Argo has model routing +
  delegate; a deliberation planner fits the "operator." ★ (bigger).
- **#37253 disable hardcoded system-prompt injections** — Argo injects soul/rules/skill
  index; make tiers individually toggleable for power users. ★
- **#36949 1Password (op://) secret backend** — Argo reads `.env`; an `op://` resolver fits
  privacy-first secret handling. ★

## 🟡 Robustness lessons (verify/avoid in Argo)
- **#37414 untruncated exec output saturates context** — Argo should cap shell/tool output
  fed back to the model (it already truncates some; verify run_code/shell).
- **#37662 / #37594 IPv6 dual-stack hang on provider connect** — Argo uses native fetch;
  watch for the same ~2s+ hangs; allow forcing IPv4.
- **#36759 model fallback ignores session switch → routes to a paid model** — Argo's /model
  hot-swap + routing: ensure a fallback never silently bills a different model.
- **#37289 context-window inconsistency (hardcoded vs real)** — Argo hardcodes some context
  windows (CONTEXT_WINDOWS, CODEX_CONTEXT); keep them honest vs the status bar.

## Verdict
The issue review's biggest payoff is the **security finding**: Argo's kernel is currently
advisory-in-disguise (bypassable keyword denylist + no shell write containment), so the
manifesto's "real safety" claim isn't yet true. Hardening `safety.rs` is the #1 action.
After that, the cheap feature wins (#37184, #37352, #36656, #36821) extend parity.
