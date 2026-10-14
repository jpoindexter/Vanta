import { z } from "zod";
import { loadDesktopAccessMode, type DesktopAccessMode } from "./access-mode.js";
import { DEFAULT_PREFS, DesktopPrefsSchema, MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS, saveDesktopPrefs, applyTimezone, type DesktopPrefs } from "./desktop-prefs.js";
import { applyAccessMode } from "./handler-status.js";
import { applyModelSettings, persistSettingsDefaults } from "./handler-models.js";
import type { DesktopState } from "./handler-state.js";
import { normalizeProviderModelSettings, providerModelSettingsCapabilities, type ProviderModelSettingsCapabilities } from "../providers/model-settings.js";

export type ConfigSection = "model" | "chat" | "safety" | "voice";
export type FieldType = "boolean" | "number" | "select" | "string";

export type FieldContext = { state: DesktopState; env: NodeJS.ProcessEnv; prefs: DesktopPrefs };

/** One setting the Settings pages may show. Present here means Vanta applies it; anything else is not served. */
export type ConfigFieldDef = {
  key: string;
  section: ConfigSection;
  type: FieldType;
  description: string;
  /** Settable values for a select, or undefined when the field does not apply to the current model. */
  options?: (ctx: FieldContext) => string[] | undefined;
  searchable?: boolean;
  read: (ctx: FieldContext) => Promise<unknown> | unknown;
  fallback: unknown;
  /** Applies a value. Returns the reason it was refused, or null when applied. */
  write: (ctx: FieldContext, value: unknown) => Promise<string | null>;
};

const asMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function currentModel(ctx: FieldContext): { provider: string; model: string } | null {
  const provider = ctx.state.providerId ?? ctx.env.VANTA_PROVIDER;
  const model = ctx.state.modelId ?? ctx.env.VANTA_MODEL;
  return provider && model ? { provider, model } : null;
}

function capabilities(ctx: FieldContext): ProviderModelSettingsCapabilities {
  const current = currentModel(ctx);
  return current ? providerModelSettingsCapabilities(current.provider, current.model, ctx.env) : {};
}

/** Persisted as the profile default (.env), the way the Model page has always meant it, and applied to the open chat. */
async function writeModelSetting(ctx: FieldContext, input: { effortLevel?: unknown; speed?: unknown }): Promise<string | null> {
  const current = currentModel(ctx);
  if (!current) return "No model is selected yet. Pick a model first.";
  try {
    const settings = normalizeProviderModelSettings(current.provider, current.model, input, ctx.env);
    applyModelSettings(ctx.state, settings);
    await persistSettingsDefaults(ctx.state.root, settings);
    return null;
  } catch (error) { return asMessage(error); }
}

const SPEED_TO_TIER = { standard: "normal", fast: "fast" } as const;
const TIER_TO_SPEED = { normal: "standard", fast: "fast" } as const;

const MANUAL = "manual";
const SMART = "smart";
const APPROVAL_TO_ACCESS: Record<string, DesktopAccessMode> = { [MANUAL]: "ask", [SMART]: "approve" };

async function approvalMode(ctx: FieldContext): Promise<string | undefined> {
  const mode = ctx.state.accessMode ?? await loadDesktopAccessMode(ctx.state.root, ctx.env);
  // Plan, Auto and Full have no name on this page; leaving the field unset says so instead of misnaming them.
  return mode === "ask" ? MANUAL : mode === "approve" ? SMART : undefined;
}

async function writePref(ctx: FieldContext, patch: DesktopPrefs): Promise<string | null> {
  const parsed = DesktopPrefsSchema.safeParse(patch);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "invalid value";
  const saved = await saveDesktopPrefs(parsed.data, ctx.env);
  if ("timezone" in patch) {
    if (saved.timezone) applyTimezone(saved, ctx.env);
    else delete ctx.env.TZ;
  }
  return null;
}

const pref = (key: keyof DesktopPrefs, ctx: FieldContext, fallback: unknown): unknown => ctx.prefs[key] ?? fallback;

export const CONFIG_FIELDS: readonly ConfigFieldDef[] = [
  {
    key: "agent.reasoning_effort", section: "model", type: "select", fallback: "medium",
    description: "How hard the model thinks by default. Only the levels this model supports are listed.",
    options: (ctx) => capabilities(ctx).effort?.options,
    read: (ctx) => ctx.state.effortLevel ?? ctx.env.VANTA_EFFORT_LEVEL ?? capabilities(ctx).effort?.defaultValue,
    write: (ctx, value) => writeModelSetting(ctx, { effortLevel: value }),
  },
  {
    key: "agent.service_tier", section: "model", type: "select", fallback: "normal",
    description: "Fast mode, for models that offer one.",
    options: (ctx) => capabilities(ctx).speed?.options.map((speed) => SPEED_TO_TIER[speed]),
    read: (ctx) => SPEED_TO_TIER[(ctx.state.providerSpeed ?? ctx.env.VANTA_SERVICE_TIER) === "fast" ? "fast" : "standard"],
    write: (ctx, value) => writeModelSetting(ctx, { speed: typeof value === "string" ? TIER_TO_SPEED[value as keyof typeof TIER_TO_SPEED] : value }),
  },
  {
    key: "approvals.mode", section: "safety", type: "select", fallback: MANUAL,
    description: "Whether Vanta asks before it edits files or runs commands. Full access, Plan and Auto are chosen from the composer's Permission chip.",
    options: () => [MANUAL, SMART],
    read: approvalMode,
    write: async (ctx, value) => {
      const mode = typeof value === "string" ? APPROVAL_TO_ACCESS[value] : undefined;
      if (!mode) return "Only manual and smart approval can be set here. Choose Full access, Plan or Auto in the composer's Permission chip.";
      await applyAccessMode(ctx.state, mode);
      return null;
    },
  },
  {
    key: "timezone", section: "chat", type: "select", searchable: true, fallback: "",
    description: "IANA timezone for dates and times in shell tools. Blank uses the system timezone.",
    options: () => Intl.supportedValuesOf("timeZone"),
    read: (ctx) => ctx.prefs.timezone ?? "",
    write: (ctx, value) => writePref(ctx, { timezone: typeof value === "string" && value.trim() ? value : undefined }),
  },
  {
    key: "display.show_reasoning", section: "chat", type: "boolean", fallback: DEFAULT_PREFS.showReasoning,
    description: "Show the model's reasoning blocks in the thread.",
    read: (ctx) => pref("showReasoning", ctx, DEFAULT_PREFS.showReasoning),
    write: (ctx, value) => writePref(ctx, { showReasoning: value as boolean }),
  },
  {
    key: "stt.enabled", section: "voice", type: "boolean", fallback: DEFAULT_PREFS.sttEnabled,
    description: "Dictation in the composer, transcribed on this device.",
    read: (ctx) => pref("sttEnabled", ctx, DEFAULT_PREFS.sttEnabled),
    write: (ctx, value) => writePref(ctx, { sttEnabled: value as boolean }),
  },
  {
    key: "voice.max_recording_seconds", section: "voice", type: "number", fallback: DEFAULT_PREFS.maxRecordingSeconds,
    description: `Longest single dictation, ${MIN_RECORDING_SECONDS} to ${MAX_RECORDING_SECONDS} seconds.`,
    read: (ctx) => pref("maxRecordingSeconds", ctx, DEFAULT_PREFS.maxRecordingSeconds),
    write: (ctx, value) => writePref(ctx, { maxRecordingSeconds: value as number }),
  },
];

export const FIELD_BY_KEY: ReadonlyMap<string, ConfigFieldDef> = new Map(CONFIG_FIELDS.map((field) => [field.key, field]));

/** The fields that apply right now (a select with no options for this model is not served). */
export function availableFields(ctx: FieldContext): ConfigFieldDef[] {
  return CONFIG_FIELDS.filter((field) => !field.options || (field.options(ctx)?.length ?? 0) > 0);
}

export const ConfigPatchSchema = z.object({ set: z.record(z.string(), z.unknown()) }).strict();
