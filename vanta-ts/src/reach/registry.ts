import type { ReachChannel, ChannelStatus } from "./channel.js";
import { webChannel } from "./channels/web.js";
import { searchChannel } from "./channels/search.js";

/** Every registered reach channel. Add a platform = append its channel here. */
export const REACH_CHANNELS: ReachChannel[] = [webChannel, searchChannel];

/** The first channel that handles a URL (URL-routed read), or undefined. */
export function resolveChannel(
  url: string,
  channels: ReachChannel[] = REACH_CHANNELS,
): ReachChannel | undefined {
  return channels.find((c) => c.canHandle(url));
}

/** Probe every channel for the doctor report. Each check is best-effort. */
export async function checkAll(
  env: NodeJS.ProcessEnv = process.env,
  channels: ReachChannel[] = REACH_CHANNELS,
): Promise<ChannelStatus[]> {
  return Promise.all(
    channels.map(async (c): Promise<ChannelStatus> => {
      try {
        return await c.check(env);
      } catch (err) {
        return { name: c.name, status: "off", activeBackend: null, detail: (err as Error).message };
      }
    }),
  );
}
