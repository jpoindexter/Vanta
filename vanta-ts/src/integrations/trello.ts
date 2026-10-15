import { z } from "zod";

export type TrelloFetch = typeof fetch;
export type TrelloBoard = { id: string; name: string; url?: string };
export type TrelloList = { id: string; name: string; idBoard?: string };
export type TrelloCard = { id: string; name: string; desc?: string; idList?: string; url?: string; dateLastActivity?: string };
type TrelloAccess = "read" | "write";
type TrelloRequest = { init: RequestInit; access?: TrelloAccess };

const BoardSchema = z.object({ id: z.string(), name: z.string(), url: z.string().optional() });
const ListSchema = z.object({ id: z.string(), name: z.string(), idBoard: z.string().optional() });
const CardSchema = z.object({ id: z.string(), name: z.string(), desc: z.string().optional(), idList: z.string().optional(), url: z.string().optional(), dateLastActivity: z.string().optional() });
const SearchSchema = z.object({ boards: z.array(BoardSchema).default([]), cards: z.array(CardSchema).default([]), organizations: z.array(z.object({ id: z.string(), displayName: z.string().optional(), name: z.string().optional() })).default([]) });
const CurrentCardSchema = z.object({ dateLastActivity: z.string().optional() });

export function trelloCredentials(env: NodeJS.ProcessEnv = process.env, access: TrelloAccess = "read"): { key: string; token: string } {
  const key = env.VANTA_TRELLO_KEY?.trim();
  const token = (access === "write" ? env.VANTA_TRELLO_WRITE_TOKEN : env.VANTA_TRELLO_TOKEN)?.trim();
  if (!key || !token) throw new Error(access === "write" ? "Trello writes need VANTA_TRELLO_KEY and VANTA_TRELLO_WRITE_TOKEN." : "Trello needs VANTA_TRELLO_KEY and VANTA_TRELLO_TOKEN. Generate a delegated token in Trello before retrying.");
  return { key, token };
}

export function trelloAuthorizationUrl(env: NodeJS.ProcessEnv = process.env, access: TrelloAccess = "read"): string {
  const key = env.VANTA_TRELLO_KEY?.trim();
  if (!key) throw new Error("Trello needs VANTA_TRELLO_KEY before authorization can start.");
  const url = new URL("https://trello.com/1/authorize");
  url.search = new URLSearchParams({ key, name: "Vanta", scope: access === "write" ? "read,write" : "read", expiration: "never", response_type: "token" }).toString();
  return url.toString();
}

function apiBase(env: NodeJS.ProcessEnv): string {
  return (env.VANTA_TRELLO_API_BASE?.trim() || "https://api.trello.com").replace(/\/$/, "");
}

function trelloError(status: number): Error {
  if (status === 401 || status === 403) return new Error("Trello rejected the credential. Re-authorize Vanta with a valid read/write token.");
  if (status === 404) return new Error("Trello item was not found or is no longer authorized.");
  if (status === 429) return new Error("Trello rate limit reached. Wait before retrying.");
  return new Error(`Trello request failed with HTTP ${status}.`);
}

async function request(
  path: string,
  options: TrelloRequest,
  env: NodeJS.ProcessEnv,
  fetcher: TrelloFetch,
): Promise<unknown> {
  const { key, token } = trelloCredentials(env, options.access);
  const url = new URL(`${apiBase(env)}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  const response = await fetcher(url, options.init);
  if (!response.ok) throw trelloError(response.status);
  return response.json();
}

function encoded(values: Record<string, string | undefined>): RequestInit {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) body.set(key, value);
  return { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body };
}

export async function listTrelloWorkspaces(env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<Array<{ id: string; name: string }>> {
  const value = await request("/1/members/me/organizations?fields=displayName,name", { init: { method: "GET" } }, env, fetcher);
  return z.array(z.object({ id: z.string(), displayName: z.string().optional(), name: z.string().optional() })).parse(value).map((item) => ({ id: item.id, name: item.displayName ?? item.name ?? item.id }));
}

export async function listTrelloBoards(env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<TrelloBoard[]> {
  return z.array(BoardSchema).parse(await request("/1/members/me/boards?fields=name,url", { init: { method: "GET" } }, env, fetcher));
}

export async function listTrelloLists(boardId: string, env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<TrelloList[]> {
  return z.array(ListSchema).parse(await request(`/1/boards/${encodeURIComponent(boardId)}/lists?fields=name,idBoard`, { init: { method: "GET" } }, env, fetcher));
}

export async function listTrelloCards(listId: string, env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<TrelloCard[]> {
  return z.array(CardSchema).parse(await request(`/1/lists/${encodeURIComponent(listId)}/cards?fields=name,desc,idList,url,dateLastActivity`, { init: { method: "GET" } }, env, fetcher));
}

export async function searchTrello(query: string, env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<z.infer<typeof SearchSchema>> {
  const value = await request(`/1/search?query=${encodeURIComponent(query)}&modelTypes=boards,cards,organizations`, { init: { method: "GET" } }, env, fetcher);
  return SearchSchema.parse(value);
}

export async function createTrelloCard(input: { listId: string; name: string; desc?: string }, env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<TrelloCard> {
  return CardSchema.parse(await request("/1/cards", { init: encoded({ idList: input.listId, name: input.name, desc: input.desc }), access: "write" }, env, fetcher));
}

export async function updateTrelloCard(input: { cardId: string; expectedDateLastActivity: string; name?: string; desc?: string }, env: NodeJS.ProcessEnv = process.env, fetcher: TrelloFetch = fetch): Promise<TrelloCard> {
  const current = CurrentCardSchema.parse(await request(`/1/cards/${encodeURIComponent(input.cardId)}?fields=dateLastActivity`, { init: { method: "GET" } }, env, fetcher));
  if (current.dateLastActivity !== input.expectedDateLastActivity) throw new Error("Trello card changed since it was read. Refresh the card and confirm the update again.");
  const value = await request(`/1/cards/${encodeURIComponent(input.cardId)}`, { init: { ...encoded({ name: input.name, desc: input.desc }), method: "PUT" }, access: "write" }, env, fetcher);
  return CardSchema.parse(value);
}
