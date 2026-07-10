import type { ReachChannel } from "../channel.js";
import { hasCookie } from "../cookie.js";
import { xueqiuQuote } from "../xueqiu.js";

export const xueqiuChannel: ReachChannel = {
  name: "xueqiu",
  description: "Xueqiu stock quotes, stock search, hot posts, and hot stocks",
  backends: ["Xueqiu API (cookie)"],
  tier: 2,
  canHandle: (url) => /^https?:\/\/([^/]+\.)?xueqiu\.com\//i.test(url),
  async check(env) {
    if (!hasCookie("xueqiu", env)) {
      return {
        name: "xueqiu",
        status: "off",
        activeBackend: null,
        detail: "no cookie (Xueqiu quote/search APIs require a logged-in browser session)",
        fix: 'cookie_import {channel:"xueqiu", browser:"brave"}',
      };
    }
    const probe = await xueqiuQuote("SH000001", { env });
    return probe.ok
      ? { name: "xueqiu", status: "ok", activeBackend: "Xueqiu API (cookie)", detail: "quote/search/hot feeds reachable" }
      : { name: "xueqiu", status: "warn", activeBackend: "Xueqiu API (cookie)", detail: probe.error, fix: probe.fix };
  },
};
