import type { ReachChannel, ChannelStatus } from "./channel.js";
import { webChannel } from "./channels/web.js";
import { searchChannel } from "./channels/search.js";
import { rssChannel } from "./channels/rss.js";
import { redditChannel } from "./channels/reddit.js";

// Order matters for resolveChannel: more specific URL matchers (rss, reddit)
// come before the catch-all `web` so a feed/reddit link routes to the right
// channel, not the generic reader.
export const REACH_CHANNELS: ReachChannel[] = [rssChannel, redditChannel, webChannel, searchChannel];

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
