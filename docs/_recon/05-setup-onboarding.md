# Hermes Recon 05 — Setup & Onboarding

Reconstructed from the read-only reference snapshot at
`/Users/jasonpoindexter/Documents/GitHub/_active/hermes-reference`.

> **Premise correction (important):** The task brief assumed `/setup` inside the
> TUI loads a `setup-phase-gating` skill and the agent drives setup
> conversationally. **That skill does not exist anywhere in this snapshot**
> (`grep -rn "setup-phase"` → zero hits; no `phase-gating` skill in `skills/`,
> `optional-skills/`, or `plugins/`). The one `setup-phase` substring is an
> unrelated community quote in `website/src/data/userStories.json` ("most of
> the (good) skills have a setup-phase and hence the required packages get
> installed") — that refers to a skill's own dependency-install step, not an
> onboarding wizard.
>
> What `/setup` in the TUI **actually** does: it is a normal slash command that
> **suspends the Ink UI and shells out to the real `hermes setup` CLI wizard**,
> then re-checks `setup.status` over RPC. There is no agent-driven /
> skill-driven conversational setup. Setup is entirely a Python CLI wizard. The
> rest of this doc documents the real mechanism. The conversational-setup idea
> should be treated as a *non-existent feature*, not ported.

---

## 1. First-run flow (the real wizard)

**Entry point:** `hermes setup` → `run_setup_wizard(args)` in
`hermes_cli/setup.py:2835`.

**What triggers "first-run" vs "reconfigure":** there is no separate first-run
trigger flag. The wizard decides by inspecting whether a provider is already
configured (`setup.py:2924`):

```python
active_provider = get_active_provider()
is_existing = (
    bool(get_env_value("OPENROUTER_API_KEY"))
    or bool(get_env_value("OPENAI_BASE_URL"))
    or active_provider is not None
)
```

- `is_existing == False` → **first-time setup** path.
- `is_existing == True` → **reconfigure** path (full wizard, every prompt
  pre-filled with the current value; `--quick` narrows to "fill only missing
  items" via `_run_quick_setup`, `setup.py:3139`).

**First-time path order** (`setup.py:2992`–`3018`):

1. Back up existing `config.yaml` to `config.yaml.bak.<timestamp>` if present
   (`setup.py:2864`).
2. Non-interactive guard (see §4) — bail with guidance if no TTY.
3. Offer **OpenClaw migration** if `~/.openclaw/` exists
   (`_offer_openclaw_migration`, `setup.py:2576`) — non-destructive port of
   config/memory/skills.
4. **Setup-mode choice** (`prompt_choice`, `setup.py:3007`):
   - `0` — **Quick Setup (Nous Portal)** — free OAuth, no API keys (default,
     recommended).
   - `1` — **Full setup** — bring-your-own keys, configure every section.

**Quick path** (`_run_first_time_quick_setup`, `setup.py:3066`):
1. Nous Portal — device-code OAuth login + curated Nous model pick
   (`_model_flow_nous`).
2. Terminal backend (`setup_terminal_backend`).
3. Apply default agent settings silently (`_apply_default_agent_settings`).
4. Optionally connect one messaging platform (`setup_gateway`).
5. Everything else gets safe defaults; print summary.

**Full path** (`setup.py:3020`–3063) runs the sections in order:
1. Model & Provider (`setup_model_provider`)
2. Terminal Backend (`setup_terminal_backend`)
3. Agent Settings — **not prompted**; first installs get recommended defaults
   silently (`_apply_default_agent_settings`), tunable later via
   `hermes setup agent`.
4. Messaging Platforms (`setup_gateway`)
5. Tools (`setup_tools`)
Then `save_config(config)` + `_print_setup_summary`.

**What it asks:** provider, credentials (API key or OAuth), default model,
terminal backend, optional messaging gateway, optional tool API keys. It does
**not** prompt for vision/TTS/credential-rotation in the main flow — those have
safe defaults and dedicated `hermes setup tts` / `hermes auth add` commands
(`setup.py:739`).

**What it writes (config locations):**
- `~/.hermes/config.yaml` — all non-secret settings (model/provider, terminal,
  tools, agent settings). `get_config_path()` = `get_hermes_home()/config.yaml`
  (`hermes_cli/config.py:530`).
- `~/.hermes/.env` — API keys / secrets. `get_env_path()` =
  `get_hermes_home()/.env` (`config.py:534`).
- `HERMES_HOME` env var can relocate the data dir (default `~/.hermes`).
- Keys written: `model.provider`, `model.default`, `model.base_url`, provider
  API-key env vars (e.g. `OPENROUTER_API_KEY`, `OPENAI_API_KEY`), messaging
  tokens (`TELEGRAM_*`, `DISCORD_*`, `SLACK_*`), tool keys, `_config_version`.

**Section sub-command form** (`SETUP_SECTIONS`, `setup.py:2713`):
`hermes setup model|tts|terminal|gateway|tools|agent` jumps straight to one
section. `hermes setup --portal` runs the one-shot Nous Portal flow
(`_run_portal_one_shot`, `setup.py:2723`). `--reset` resets config to defaults
first.

**Contextual onboarding hints** (`agent/onboarding.py`) are a *separate,
unrelated* mechanism: tiny one-time tips shown the first time a user hits a
behavior fork (message-while-busy, first long-running tool, OpenClaw residue).
They are tracked per-install under `onboarding.seen.<flag>` in `config.yaml`
(`mark_seen`, `onboarding.py:146`). This is NOT the wizard — explicitly designed
to *avoid* "blocking first-run questionnaires."

---

## 2. `/setup` in the TUI — what it actually does (NOT skill-driven)

Defined in `ui-tui/src/app/slash/commands/setup.ts` and registered in
`ui-tui/src/app/slash/registry.ts`:

```ts
export const setupCommands: SlashCommand[] = [{
  help: 'run full setup wizard (launches `hermes setup`)',
  name: 'setup',
  run: (arg, ctx) => void runExternalSetup({
    args: ['setup', ...arg.split(/\s+/).filter(Boolean)],
    ctx, done: 'setup complete — starting session…',
    launcher: launchHermesCommand, suspend: withInkSuspended
  })
}]
```

`runExternalSetup` (`ui-tui/src/app/setupHandoff.ts`):
1. `transcript.sys("launching \`hermes setup\`…")`, set UI status `setup running…`.
2. **Suspend the Ink TUI** (`withInkSuspended`) and **launch the real
   `hermes setup` CLI as a child process** (`launchHermesCommand`). The CLI
   wizard takes over the terminal — same Python wizard from §1.
3. On non-zero exit / launch error → status back to `setup required`, surface
   the exit code, return.
4. On success → call gateway RPC `setup.status`. If `provider_configured ===
   false`, report "still no provider configured" and stay in `setup required`.
5. Otherwise emit the `done` message and start a fresh session
   (`session.newSession()`).

So `/setup` in the TUI = "pause UI, run the CLI wizard, verify a provider got
configured, restart the session." There are **no setup phases, no gating skill,
and no conversational agent loop.** The TUI also shows a
`SETUP_REQUIRED_TITLE` / `buildSetupRequiredSections()` panel
(`ui-tui/src/content/setup.ts`) when `setup.status.provider_configured` is
false, which is what prompts the user to run `/setup` in the first place.

> Slash commands *can* map to skills generically — `agent/skill_commands.py`
> scans `~/.hermes/skills/` and exposes each as `/<skill-name>`
> (`scan_skill_commands`, line 263). But `/setup` is a hard-coded TUI command,
> not a skill, and overrides any skill of the same name.

---

## 3. Provider / model selection

**Provider catalog** — `hermes_cli/providers.py`, the `HERMES_OVERLAYS` dict of
`HermesOverlay` entries. **34 providers** in this snapshot:

`openrouter`, `nous`, `openai-codex`, `openai-api`, `xai-oauth`, `qwen-oauth`,
`google-gemini-cli`, `lmstudio`, `copilot-acp`, `github-copilot`, `anthropic`,
`zai`, `kimi-for-coding`, `stepfun`, `minimax`, `minimax-oauth`, `minimax-cn`,
`deepseek`, `alibaba`, `alibaba-coding-plan`, `opencode`, `opencode-go`, `kilo`,
`huggingface`, `novita`, `xai`, `nvidia`, `xiaomi`, `tencent-tokenhub`, `arcee`,
`gmi`, `ollama-cloud`, `azure-foundry`, `bedrock`.

Each overlay declares a `transport` (`openai_chat`, `anthropic_messages`, or
`codex_responses`), an optional `base_url_override`, and credential metadata.

**How a provider is chosen:** both `hermes model` (`cmd_model`,
`main.py:2188`) and the setup wizard (`setup_model_provider`, `setup.py:692`)
delegate to the **single shared path** `select_provider_and_model()`
(`hermes_cli/main.py:2216`):
- Reads effective provider: `config.yaml model.provider` > env
  `HERMES_INFERENCE_PROVIDER` > `auto`.
- Shows the provider picker, prompts for credentials (API key prompt or OAuth
  device-code login depending on the provider), then the model picker.
- Persists via its own `load_config`/`save_config` cycle; the wizard then
  **re-reads config from disk** into its dict to avoid clobbering
  (`setup.py:723`, the `#4172` fix).

**Model lists:** curated per-provider model manifests via
`hermes_cli/model_catalog.py` — `get_curated_openrouter_models()` (returns
`[(id, description), …]`) and `get_curated_nous_models()` (returns `[id, …]`),
both reading a `providers.<name>.models` block, with hardcoded fallbacks when
the manifest is unavailable.

**Where stored:** selected provider + model land in `config.yaml` under
`model.provider` / `model.default` (+ `model.base_url` for custom/openai-compat
providers); credentials in `~/.hermes/.env`.

---

## 4. TTY gating (interactive vs piped)

**Python CLI wizard** (`hermes_cli/setup.py`):
- `is_interactive_stdin()` (`setup.py:165`) — `sys.stdin.isatty()`, exception-
  safe, returns `False` when stdin is `None` or not a TTY.
- `run_setup_wizard` (`setup.py:2879`): `non_interactive` comes from
  `args.non_interactive` **OR** `not is_interactive_stdin()`. When
  non-interactive it calls `print_noninteractive_setup_guidance()`
  (`setup.py:176`) and returns — i.e. it refuses to run and prints `hermes
  config set …` / env-var instructions instead. There is **no auto-defaulting**
  in the wizard when piped; the fallback is documentation, not silent config.

**Install script** (`scripts/install.sh` — this is the script the test
`tests/test_install_sh_setup_wizard_tty_probe.py` guards, regression #16746):
- Top-level detection sets `IS_INTERACTIVE` / `NON_INTERACTIVE`
  (`install.sh:81`–90); `curl | bash` is treated as non-interactive.
- Three functions need to read from the terminal even when piped —
  `run_setup_wizard`, `install_system_packages`, `maybe_start_gateway`. They
  must use an **open-based `/dev/tty` probe**, not a bare existence check:
  ```sh
  if (: </dev/tty) 2>/dev/null; then ... < /dev/tty
  ```
  The test asserts none of those functions use `[ -e /dev/tty ]` and that each
  actually opens `/dev/tty`. Reason: in a Docker build `/dev/tty` exists as a
  device node but opening it fails with ENXIO, so an existence-only check would
  pass and then crash on the `< /dev/tty` redirect.
- Prompt fallback ladder (`install.sh:308`): `$NON_INTERACTIVE` → skip;
  `$IS_INTERACTIVE` → read stdin; else if `/dev/tty` is readable+writable →
  prompt via `/dev/tty`; else default/skip.

**TUI** (`ui-tui`): doesn't TTY-gate setup itself — it inherits the CLI
wizard's gating because `/setup` just launches `hermes setup` as a child after
suspending Ink.

---

## 5. Vanta-port note (what Hermes has that Vanta's `vanta setup` lacks)

Vanta already has (`vanta-ts/src/setup.ts`, `vanta-ts/src/cli.ts`,
`vanta-ts/src/providers/catalog.ts`):
- `runSetup()` interactive wizard: provider menu → hidden API-key prompt →
  model prompt → `upsertEnv()` writes to `.env` (mode `0o600`).
- `isConfigured(env)` gate (`cli.ts:78`) + `process.stdin.isTTY` check
  (`cli.ts:97`) — same shape as Hermes' `is_interactive_stdin` + `is_existing`.
- `PROVIDER_CATALOG` with **6 providers**: gemini, openai, anthropic,
  claude-code, openrouter, ollama. Each has `id/label/envVar/defaultModel/
  signupUrl`.

**Gaps vs Hermes — things to consider porting (or deliberately not):**

| Capability | Hermes | Vanta | Port? |
|---|---|---|---|
| Provider count | 34, with `transport` + `base_url_override` overlays | 6 | Grow catalog as needed; Hermes' `transport` field (openai_chat / anthropic_messages / codex_responses) is the key abstraction worth stealing |
| OAuth / device-code login | Yes (Nous Portal, xai, qwen, minimax, gemini-cli, copilot) | No — key-paste only | Real gap if you want keyless providers |
| Quick vs Full setup modes | Yes (Portal quick path + full sections) | Single linear flow | Optional |
| Section sub-commands | `hermes setup model\|tts\|terminal\|gateway\|tools\|agent` | No | Nice-to-have for reconfigure |
| Reconfigure with current-value defaults | Yes | No | Useful once installs exist |
| Curated per-provider model manifests w/ fallback | Yes (`model_catalog.py`) | Single `defaultModel` per provider | Richer model picker is the biggest UX delta |
| Config backup before write | Yes (`.yaml.bak.<ts>`) | No (just upserts `.env`) | Cheap safety win |
| Migration import (OpenClaw) | Yes | N/A | Skip |
| Messaging-gateway setup | Yes (Telegram/Discord/Slack/Matrix/…) | No | Only if Vanta grows a gateway |
| Non-interactive guidance instead of crash | Yes (`print_noninteractive_setup_guidance`) | TTY-gated (cli.ts:97) — bails | Roughly parity |
| `/dev/tty` open-based probe in installer | Yes (regression-tested) | N/A (no install.sh) | Skip unless Vanta ships a curl-pipe installer |
| **In-TUI `/setup` (skill-driven, conversational)** | **Does NOT exist** — `/setup` just shells out to the CLI wizard | N/A | **Nothing to port** — the brief's premise was wrong |

**Bottom line:** the two real Hermes advantages worth porting are (a) **OAuth /
device-code login** for keyless providers and (b) a **richer curated
model-picker per provider** (`model_catalog.py` manifest + fallback). The
"skill-driven in-TUI setup" is a non-feature. Hermes' in-TUI setup is exactly
Vanta's model would be: suspend the UI, run the same CLI wizard, verify config,
restart the session.
