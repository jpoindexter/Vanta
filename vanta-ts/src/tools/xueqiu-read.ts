import { z } from "zod";
import type { Tool } from "./types.js";
import { xueqiuHotPosts, xueqiuHotStocks, xueqiuQuote, xueqiuSearch } from "../reach/xueqiu.js";

const Args = z.object({
  action: z.enum(["quote", "search", "hot_posts", "hot_stocks"]),
  symbol: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  type: z.number().int().optional(),
});

type ArgsData = z.infer<typeof Args>;

function out(r: Awaited<ReturnType<typeof xueqiuQuote>>) {
  return r.ok ? { ok: true, output: r.output } : { ok: false, output: `${r.error}\nfix: ${r.fix}` };
}

async function executeRead(a: ArgsData) {
  if (a.action === "quote") {
    if (!a.symbol) return { ok: false, output: "xueqiu_read quote needs symbol" };
    return out(await xueqiuQuote(a.symbol));
  }
  if (a.action === "search") {
    if (!a.query) return { ok: false, output: "xueqiu_read search needs query" };
    return out(await xueqiuSearch(a.query, a.limit ?? 10));
  }
  return out(a.action === "hot_posts" ? await xueqiuHotPosts(a.limit ?? 10) : await xueqiuHotStocks(a.limit ?? 10, a.type ?? 10));
}

export const xueqiuReadTool: Tool = {
  schema: {
    name: "xueqiu_read",
    description:
      "Read Xueqiu stock quotes, stock search, hot posts, and hot-stock ranking using a stored logged-in xueqiu cookie. " +
      "Actions: quote {symbol}, search {query, limit?}, hot_posts {limit?}, hot_stocks {limit?, type?}.",
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["quote", "search", "hot_posts", "hot_stocks"] },
        symbol: { type: "string", description: "quote symbol, e.g. SH600519, SZ000858, AAPL, 00700" },
        query: { type: "string", description: "stock code or name for action=search" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        type: { type: "integer", description: "hot_stocks ranking type; 10 popularity, 12 watchlist" },
      },
    },
  },
  describeForSafety: (a) => `read xueqiu ${String(a.action ?? "")}`,
  async execute(raw) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) return { ok: false, output: 'xueqiu_read needs an "action" (quote|search|hot_posts|hot_stocks)' };
    return executeRead(parsed.data);
  },
};
