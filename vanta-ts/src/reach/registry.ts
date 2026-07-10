import type { ReachChannel, ChannelStatus } from "./channel.js";
import { webChannel } from "./channels/web.js";
import { searchChannel } from "./channels/search.js";
import { rssChannel } from "./channels/rss.js";
import { redditChannel } from "./channels/reddit.js";
import { twitterChannel } from "./channels/twitter.js";
import { linkedinChannel } from "./channels/linkedin.js";
import { youtubeChannel } from "./channels/youtube.js";
import { githubChannel } from "./channels/github.js";
import { podcastChannel } from "./channels/podcast.js";
import { v2exChannel } from "./channels/v2ex.js";
import { bilibiliChannel } from "./channels/bilibili.js";
import { xueqiuChannel } from "./channels/xueqiu.js";
import { xiaohongshuChannel } from "./channels/xiaohongshu.js";

// Order: most-specific URL matchers first (youtube/bilibili/github/podcast/rss/reddit/twitter/linkedin/v2ex/xueqiu/xiaohongshu)
// so a YouTube link routes to youtube, not the generic web reader.
export const REACH_CHANNELS: ReachChannel[] = [
  youtubeChannel,
  bilibiliChannel,
  githubChannel,
  podcastChannel,
  rssChannel,
  redditChannel,
  twitterChannel,
  linkedinChannel,
  v2exChannel,
  xueqiuChannel,
  xiaohongshuChannel,
  webChannel,
  searchChannel,
];

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
