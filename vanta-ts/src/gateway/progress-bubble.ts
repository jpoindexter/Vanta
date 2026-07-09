export type ProgressBubblePlan = {
  enabled: true;
  thresholdMs: number;
  text: string;
};

export type ProgressBubbleConfig = {
  enabled?: boolean;
  thresholdMs?: number;
  text?: string;
  platformIds?: ReadonlySet<string>;
};

const DEFAULT_TEXT = "Still working. I’ll send the answer here when it is ready.";
const TOKEN_WINDOW_THRESHOLDS_MS: Record<string, number> = {
  line: 50_000,
  whatsapp: 23 * 60 * 60 * 1000,
};

export function progressBubbleForPlatform(
  platformId: string,
  config: ProgressBubbleConfig = {},
): ProgressBubblePlan | null {
  if (config.enabled === false) return null;
  const id = platformId.toLowerCase();
  const supported = (id in TOKEN_WINDOW_THRESHOLDS_MS) || config.platformIds?.has(id) === true;
  if (!supported) return null;
  const thresholdMs = config.thresholdMs ?? TOKEN_WINDOW_THRESHOLDS_MS[id];
  if (thresholdMs === undefined || !Number.isFinite(thresholdMs) || thresholdMs <= 0) return null;
  return { enabled: true, thresholdMs, text: config.text ?? DEFAULT_TEXT };
}
