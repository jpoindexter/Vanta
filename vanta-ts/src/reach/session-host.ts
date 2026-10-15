const CHANNEL_HOSTS: Record<string, string> = {
  linkedin: "linkedin.com",
  reddit: "reddit.com",
  twitter: "x.com",
  xiaohongshu: "xiaohongshu.com",
  xueqiu: "xueqiu.com",
};

function configuredHost(channel: string, env: NodeJS.ProcessEnv): string | null {
  const key = `VANTA_BROWSER_SESSION_HOST_${channel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const host = env[key]?.trim().toLowerCase();
  return host && /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/** Host a stored channel session may be disclosed to. */
export function sessionHost(
  channel: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return CHANNEL_HOSTS[channel] ?? configuredHost(channel, env);
}

/** True only for the bound host or one of its subdomains. */
export function sessionMayAccessUrl(
  channel: string,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const allowed = sessionHost(channel, env);
  if (!allowed) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === allowed || host.endsWith(`.${allowed}`);
  } catch {
    return false;
  }
}
