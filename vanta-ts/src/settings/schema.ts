import { z } from "zod";
import { EFFORT_LEVELS } from "../types.js";
import { SshProfileSchema } from "../ssh/config.js";
import { MemorySettingsSchema } from "./memory-settings.js";
import { McpAccessSchema } from "./mcp-access.js";
import { SkillOverridesSchema } from "../skills/overrides.js";
import { SkillSettingsSchema } from "../skills/budget.js";
import { UxSettingsSchema } from "./ux-settings.js";

// Layered settings.json schema (user → project → local).
// Non-secret config (permissions, allowed tools, ui prefs). Unknown keys are
// dropped (`.strict()`) so bad config cannot silently affect runtime behavior.

export const SettingsSchema = z.object({
  /** Tool names always approved without a prompt. */
  allowedTools: z.array(z.string()).optional(),
  /** Tool names always blocked. */
  blockedTools: z.array(z.string()).optional(),
  /** VANTA_* env overrides applied on top of .env. Non-secret only. */
  env: z.record(z.string()).optional(),
  /** Disable individual EF gates. */
  gates: z.object({
    antiSlop: z.boolean().optional(),
    modeDetect: z.boolean().optional(),
    researchGate: z.boolean().optional(),
    stallUnblock: z.boolean().optional(),
  }).optional(),
  /** Disable the background agent session view and controls. */
  disableAgentView: z.boolean().optional(),
  /** Default model effort for new sessions. */
  effortLevel: z.enum(EFFORT_LEVELS).optional(),
  /** Prune stored sessions older than N days. Unset/<=0 = no cleanup (today's
   *  behavior). Consumed by `sessions/cleanup.ts` (`pruneSessions`). */
  cleanupPeriodDays: z.number().optional(),
  /** Auto permission mode classifier settings. */
  autoMode: z.object({
    enabled: z.boolean().optional(),
    softDeny: z.boolean().optional(),
    rules: z.array(z.object({
      action: z.enum(["allow", "ask", "soft_deny"]),
      tool: z.string().optional(),
      pattern: z.string().optional(),
      label: z.string().optional(),
    })).optional(),
  }).optional(),
  /** UI preferences. VANTA-SETTINGS-UX folds in the display/UX toggles
   *  (spinnerVerbs/messageTimestamps/timestampStyle/effortIndicator/
   *  terminalTitle/hyperlinks/awaySummaryMs/idleReturn/jsonFormat) so each maps
   *  to its existing VANTA_* env var. Applied in `applySettingsEnv` (env wins;
   *  unset = today's behavior). */
  ui: z.object({
    theme: z.string().optional(),
    spinner: z.string().optional(),
    noTui: z.boolean().optional(),
    /** Input box position: "float" (default) or "bottom" (pinned chat box). */
    composerAnchor: z.enum(["float", "bottom"]).optional(),
    /** Reply verbosity preset (the /output-style choice). */
    outputStyle: z.string().optional(),
    /** Show predicted next prompts below the composer after each completed turn. */
    promptSuggestionsEnabled: z.boolean().optional(),
  }).merge(UxSettingsSchema).optional(),
  /** Opt-in runtime plugin framework config. Plugin code is disabled by default. */
  plugins: z.object({
    enabled: z.array(z.string()).optional(),
    trustProjectPlugins: z.boolean().optional(),
  }).optional(),
  /** OS sandbox config (the /sandbox UI). Persists the VANTA_SANDBOX* intent +
   *  pre-install deps + per-tool bypass/enforce overrides; env stays the runtime truth. */
  sandbox: z.object({
    /** Sandbox every code runner (maps to VANTA_SANDBOX). */
    enabled: z.boolean().optional(),
    /** Sandbox shell_cmd only, without the code runners (maps to VANTA_SHELL_SANDBOX). */
    shellOnly: z.boolean().optional(),
    /** Allow network inside the sandbox (maps to VANTA_SANDBOX_NET). Off = isolated. */
    allowNetwork: z.boolean().optional(),
    /** Hosts blocked even when the network is otherwise allowed. Deny always wins
     *  over allow (default-deny posture). Exact + subdomain match. Empty = no-op. */
    deniedDomains: z.array(z.string()).optional(),
    /** Packages to pre-install into a sandbox session. */
    dependencies: z.array(z.string()).optional(),
    /** Per-tool sandbox rules: bypass (run unsandboxed) or enforce (always sandbox). */
    overrides: z.array(z.object({
      tool: z.string(),
      rule: z.enum(["bypass", "enforce"]),
    })).optional(),
  }).optional(),
  /** Shell command whose stdout is used as the API key for the active provider.
   *  Executed at startup; cached for 5 minutes. Example: `'op read op://vault/anthropic/key'` */
  api_key_helper: z.string().optional(),
  /** Project context-file trust. `auto` trusts every project's context without a
   *  prompt (a single-operator convenience; VANTA_TRUST_ALL is the env equivalent).
   *  MCP-server trust is unaffected and still prompts. */
  trust: z.object({
    auto: z.boolean().optional(),
  }).optional(),
  /** Named SSH connection profiles (run-anywhere). `shell_cmd {ssh:"<name>"}` runs
   *  a command on the host; `vanta ssh <name>` opens an interactive shell. */
  sshConfigs: z.array(SshProfileSchema).optional(),
  /** VANTA-SETTINGS-GIT — git settings parity (resolvers in `git-settings.ts`). */
  /** Override the attribution line appended to commits (e.g. a Co-Authored-By
   *  trailer). Unset = no attribution appended (today's behavior). */
  attribution: z.string().optional(),
  /** Fold a git best-practice block into the system prompt. Unset/false =
   *  no git block (today's prompt). */
  includeGitInstructions: z.boolean().optional(),
  /** PR-link format; `{PR}` is replaced with the number in the status footer.
   *  Unset = no PR segment (today's footer). */
  prUrlTemplate: z.string().optional(),
  /** Whether the @file picker excludes gitignored paths. Resolver defaults true;
   *  unset keeps the picker's current (unfiltered) behavior. */
  respectGitignore: z.boolean().optional(),
  /** Let web_fetch bypass its preflight/domain (SSRF) safety check for trusted
   *  use. Unset/false = preflight ON (today's behavior); true = skip the guard.
   *  The `VANTA_SKIP_WEBFETCH_PREFLIGHT` env override is the env equivalent. */
  skipWebFetchPreflight: z.boolean().optional(),
  /** VANTA-PRIVACY-LEVELS — outbound-traffic privacy posture. Resolved by
   *  `privacy/levels.ts` (env `VANTA_PRIVACY` > this > "default"). `default` =
   *  today's behavior (all categories allowed); `no-telemetry` blocks only
   *  telemetry/analytics; `essential` allows only the provider + kernel calls
   *  the agent needs to function. */
  privacyLevel: z.enum(["default", "no-telemetry", "essential"]).optional(),
  /** VANTA-MAGIC-DOCS — markdown files (e.g. `["STATUS.md","PROGRESS.md"]`) that
   *  get a managed auto-updated region refreshed after each turn with a compact
   *  session summary, between marker comments so hand-written content is
   *  preserved. Resolved by `repl/magic-docs.ts` (`resolveMagicDocs`). Unset/empty
   *  = no writes (today's behavior). */
  magicDocs: z.array(z.string()).optional(),
  /** VANTA-SETTINGS-MEM — memory-layer config (resolvers in `memory-settings.ts`).
   *  `autoMemory` maps to VANTA_EXTRACT_MEMORIES; `excludes` are patterns the
   *  memory layer must not capture; `plansDir` is where plan docs live. Unset =
   *  today's behavior (autoMemory off). */
  memory: MemorySettingsSchema.optional(),
  /** VANTA-SETTINGS-MCP — per-session MCP server access control (resolvers in
   *  `mcp-access.ts`). An `allow`/`deny` list of server names decides which
   *  `.mcp.json` servers may mount this session: deny ALWAYS wins over allow, an
   *  allowlist (when present) restricts to only the listed servers. Unset = all
   *  configured servers mount (today's behavior). The named mount-filter point is
   *  `mcp/mount.ts mountMcpServers` (`names = Object.keys(config.servers)`), where
   *  `filterMountableServers(names, settings.mcp)` would gate the mount loop — NOT
   *  wired this round. The MCP trust dialog + kernel still gate every mounted tool. */
  mcp: McpAccessSchema.optional(),
  /** VANTA-SKILL-OVERRIDE-SETTING — per-skill-name visibility overrides
   *  (resolvers in `skills/overrides.ts`). A map from skill name to
   *  `{disabled?, hiddenFromModel?, hiddenFromMenu?}`: `disabled` hides a skill
   *  from BOTH the model index and the operator menu; `hiddenFromModel` keeps it
   *  out of the prompt index but in the menu; `hiddenFromMenu` does the reverse.
   *  A skill with no override stays visible to both (today's behavior) — the
   *  operator hides a noisy skill from the model or turns one off without deleting
   *  it. The named filter point is `skills/select.ts selectSkillsForTask`, where
   *  `filterModelSkills(names, settings.skillOverrides)` would drop hidden/disabled
   *  skills before ranking — NOT wired this round. The kernel still gates every
   *  tool a skill uses. */
  skillOverrides: SkillOverridesSchema.optional(),
  /** VANTA-SETTINGS-SKILL — skill-index context budget (schema in `skills/budget.ts`).
   *  `contextBudgetTokens` caps the total tokens the skill index may consume in the
   *  prompt; `maxSkills` caps how many skills enter the index (highest-ranked first);
   *  `descriptionMaxChars` clips each skill description. Unset = today's behavior (all
   *  skills, the existing 100-char clip). The named apply point is `prompt.ts skillsTier`
   *  (the index from `opts.skills`, ranked upstream via `skills/usage-rank.ts`): the
   *  skill-selection site would run `applySkillBudget(ranked, settings.skills)` and
   *  render `clipSkillDescription` BEFORE passing the entries — NOT wired this round.
   *  The kernel still gates every tool a skill uses. */
  skills: SkillSettingsSchema.optional(),
}).strict().partial();

export type Settings = z.infer<typeof SettingsSchema>;
