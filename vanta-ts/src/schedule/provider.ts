import { isDue, loadCron as defaultLoadCron, type CronEntry } from "./cron.js";

export type SchedulerHookName =
  | "before_select_due"
  | "after_select_due"
  | "before_fire"
  | "after_fire";

export const SCHEDULER_GROWTH_HOOKS: readonly SchedulerHookName[] = [
  "before_select_due",
  "after_select_due",
  "before_fire",
  "after_fire",
] as const;

export type SchedulerSelectArgs = {
  dataDir: string;
  now: Date;
  load?: (dataDir: string) => Promise<CronEntry[]>;
};

export type SchedulerSelection = {
  entries: CronEntry[];
  due: CronEntry[];
};

export type SchedulerProvider = {
  id: string;
  growthHooks: readonly SchedulerHookName[];
  selectDue(args: SchedulerSelectArgs): Promise<SchedulerSelection>;
};

async function builtinSelectDue(args: SchedulerSelectArgs): Promise<SchedulerSelection> {
  const load = args.load ?? defaultLoadCron;
  const entries = await load(args.dataDir);
  return {
    entries,
    due: entries.filter((entry) => entry.status === "active" && isDue(entry.cron, args.now)),
  };
}

export const builtinCronScheduler: SchedulerProvider = {
  id: "builtin-cron",
  growthHooks: SCHEDULER_GROWTH_HOOKS,
  selectDue: builtinSelectDue,
};

export type SchedulerResolveResult = SchedulerSelection & {
  providerId: string;
  fellBack: boolean;
  error?: string;
};

/**
 * Resolve due tasks through an optional scheduler provider. Any provider failure
 * falls back to the built-in cron ticker so a bad seam never leaves Vanta with
 * no trigger source.
 */
export async function resolveSchedulerDue(
  args: SchedulerSelectArgs & { provider?: SchedulerProvider },
): Promise<SchedulerResolveResult> {
  const provider = args.provider ?? builtinCronScheduler;
  try {
    return { ...await provider.selectDue(args), providerId: provider.id, fellBack: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ...await builtinCronScheduler.selectDue(args), providerId: builtinCronScheduler.id, fellBack: true, error };
  }
}
