import { resolve } from "node:path";
import { loadEnv } from "../cli/startup-env.js";
import { applySettingsEnv, loadSettings } from "../settings/store.js";
import { resolveVantaHome } from "../store/home.js";

type BaseSelection = Readonly<{ model: string | null; provider: string | null }>;
const selections = new WeakMap<NodeJS.ProcessEnv, Promise<BaseSelection>>();

/** Startup flags clone env objects, but must not recapture named values as base identity. */
export function carryBaseProfileSelection(source: NodeJS.ProcessEnv, target: NodeJS.ProcessEnv): void {
  const pending = selections.get(source);
  const identity = (env: NodeJS.ProcessEnv) => JSON.stringify([
    resolve(env.VANTA_PROFILE_BASE_HOME?.trim() || resolveVantaHome(env)),
    resolve(env.VANTA_PROJECT_ROOT?.trim() || process.cwd()),
  ]);
  if (pending && identity(source) === identity(target)) selections.set(target, pending);
}

/** Capture base identity before named activation. No credentials, provider startup or environment mutation. */
export function baseProfileSelection(env: NodeJS.ProcessEnv): Promise<BaseSelection> {
  let pending = selections.get(env);
  if (!pending) {
    pending = readBaseSelection(env);
    selections.set(env, pending);
  }
  return pending;
}

async function readBaseSelection(env: NodeJS.ProcessEnv): Promise<BaseSelection> {
  const home = env.VANTA_PROFILE_BASE_HOME?.trim() || resolveVantaHome(env);
  const baseEnv: NodeJS.ProcessEnv = { ...env, VANTA_HOME: home };
  if (resolve(resolveVantaHome(env)) !== resolve(home)) {
    for (const key of ["VANTA_MODEL", "VANTA_PROVIDER", "ARGO_MODEL", "ARGO_PROVIDER"]) delete baseEnv[key];
  }
  const root = env.VANTA_PROJECT_ROOT?.trim() || process.cwd();
  loadEnv(root, baseEnv);
  applySettingsEnv(await loadSettings(root, baseEnv), baseEnv);
  return Object.freeze({ model: baseEnv.VANTA_MODEL ?? null, provider: baseEnv.VANTA_PROVIDER ?? null });
}
