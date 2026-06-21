import { useEffect, useState } from "react";
import { type SlackChannel } from "../repl/slack-suggest.js";
import { slackToken, getCachedChannels, realSlackFetch } from "../comms/slack-channels.js";

/** Loads a Slack channel list (via the live fetch) → returns it as a Promise. */
export type ChannelLoader = () => Promise<SlackChannel[]>;

/**
 * Load the workspace's Slack channels ONCE when a bot token is configured, for
 * the composer's `#`-completion. Returns `[]` when no token is set / on any
 * failure — it never throws and never blocks the TUI (the fetch is fire-and-
 * forget; the 60s cache lives in slack-channels.ts). `loader` is injectable for
 * tests; the default uses the real Slack fetch keyed by `VANTA_SLACK_TOKEN`.
 */
export function useSlackChannels(
  loader?: ChannelLoader,
  env: NodeJS.ProcessEnv = process.env,
): SlackChannel[] {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  useEffect(() => {
    const token = slackToken(env);
    const load = loader ?? (token ? (): Promise<SlackChannel[]> => getCachedChannels({ fetchJson: realSlackFetch, token }) : null);
    if (!load) return; // no token + no injected loader → stays [], no suggestions
    let alive = true;
    load()
      .then((cs) => {
        if (alive) setChannels(cs);
      })
      .catch(() => {
        /* a Slack/network failure → no suggestions; never crash the composer */
      });
    return () => {
      alive = false;
    };
  }, [loader, env]);
  return channels;
}
