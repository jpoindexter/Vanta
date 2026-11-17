import { z } from "zod";

export type DropboxFetch = typeof fetch;
export type DropboxEntry = { id: string; name: string; pathDisplay?: string; rev?: string; tag: "file" | "folder" | "deleted" };
type DropboxAccess = "read" | "write";

const EntrySchema = z.object({ ".tag": z.enum(["file", "folder", "deleted"]), id: z.string().default(""), name: z.string(), path_display: z.string().optional(), rev: z.string().optional() });
const ListSchema = z.object({ entries: z.array(EntrySchema), cursor: z.string().optional(), has_more: z.boolean().optional() });
const SearchSchema = z.object({ matches: z.array(z.object({ metadata: z.object({ metadata: EntrySchema }) })) });
const UploadSchema = EntrySchema;

export function dropboxToken(env: NodeJS.ProcessEnv = process.env, access: DropboxAccess = "read"): string {
  const token = (access === "write" ? env.VANTA_DROPBOX_WRITE_TOKEN : env.VANTA_DROPBOX_TOKEN)?.trim();
  if (!token) throw new Error(access === "write" ? "Dropbox writes need VANTA_DROPBOX_WRITE_TOKEN." : "Dropbox needs VANTA_DROPBOX_TOKEN. Complete Dropbox OAuth and save the access token before retrying.");
  return token;
}

export function isSafeDropboxPath(path: string): boolean {
  return (path === "" || path.startsWith("/")) && !path.split("/").includes("..");
}

function apiBase(env: NodeJS.ProcessEnv): string {
  return (env.VANTA_DROPBOX_API_BASE?.trim() || "https://api.dropboxapi.com").replace(/\/$/, "");
}

function contentBase(env: NodeJS.ProcessEnv): string {
  return (env.VANTA_DROPBOX_CONTENT_BASE?.trim() || "https://content.dropboxapi.com").replace(/\/$/, "");
}

function apiError(status: number): Error {
  if (status === 401 || status === 403) return new Error("Dropbox rejected the credential. Re-authorize Vanta and retry.");
  if (status === 409) return new Error("Dropbox reported a path or revision conflict. Refresh the file before replacing it.");
  if (status === 429) return new Error("Dropbox rate limit reached. Wait before retrying.");
  return new Error(`Dropbox request failed with HTTP ${status}.`);
}

function headers(env: NodeJS.ProcessEnv, extra: Record<string, string> = {}, access: DropboxAccess = "read"): Record<string, string> {
  return { authorization: `Bearer ${dropboxToken(env, access)}`, ...extra };
}

function mapEntry(entry: z.infer<typeof EntrySchema>): DropboxEntry {
  return { id: entry.id, name: entry.name, pathDisplay: entry.path_display, rev: entry.rev, tag: entry[".tag"] };
}

async function jsonPost(path: string, body: unknown, env: NodeJS.ProcessEnv, fetcher: DropboxFetch): Promise<unknown> {
  const response = await fetcher(`${apiBase(env)}${path}`, { method: "POST", headers: headers(env, { "content-type": "application/json" }), body: JSON.stringify(body) });
  if (!response.ok) throw apiError(response.status);
  return response.json();
}

export async function listDropbox(path = "", env: NodeJS.ProcessEnv = process.env, fetcher: DropboxFetch = fetch): Promise<{ entries: DropboxEntry[]; cursor?: string; hasMore: boolean }> {
  if (!isSafeDropboxPath(path)) throw new Error("Dropbox path must be root or an absolute path without '..'.");
  const value = ListSchema.parse(await jsonPost("/2/files/list_folder", { path, recursive: false, include_deleted: false }, env, fetcher));
  return { entries: value.entries.map(mapEntry), cursor: value.cursor, hasMore: Boolean(value.has_more) };
}

export async function searchDropbox(query: string, path = "", env: NodeJS.ProcessEnv = process.env, fetcher: DropboxFetch = fetch): Promise<DropboxEntry[]> {
  if (!isSafeDropboxPath(path)) throw new Error("Dropbox path must be root or an absolute path without '..'.");
  const value = SearchSchema.parse(await jsonPost("/2/files/search_v2", { query, options: { path, max_results: 100, filename_only: false } }, env, fetcher));
  return value.matches.map((match) => mapEntry(match.metadata.metadata));
}

export async function downloadDropbox(path: string, env: NodeJS.ProcessEnv = process.env, fetcher: DropboxFetch = fetch): Promise<{ content: string; rev?: string }> {
  if (!isSafeDropboxPath(path) || !path) throw new Error("Dropbox download needs an absolute file path without '..'.");
  const response = await fetcher(`${contentBase(env)}/2/files/download`, { method: "POST", headers: headers(env, { "Dropbox-API-Arg": JSON.stringify({ path }) }) });
  if (!response.ok) throw apiError(response.status);
  const bytes = Number(response.headers.get("content-length") ?? 0);
  if (bytes > 1_000_000) throw new Error("Dropbox file is too large to attach as task context (limit 1 MB).");
  const content = await response.text();
  if (content.includes("\0")) throw new Error("Dropbox file appears binary and cannot be attached as text context.");
  const metadata = response.headers.get("dropbox-api-result");
  const parsed = metadata ? EntrySchema.safeParse(JSON.parse(metadata)) : null;
  return { content: content.length > 80_000 ? `${content.slice(0, 80_000)}\n…[truncated]` : content, rev: parsed?.success ? parsed.data.rev : undefined };
}

export async function uploadDropbox(input: { path: string; content: string; mode: "add" | "update"; rev?: string }, env: NodeJS.ProcessEnv = process.env, fetcher: DropboxFetch = fetch): Promise<DropboxEntry> {
  if (!isSafeDropboxPath(input.path) || !input.path) throw new Error("Dropbox upload needs an absolute file path without '..'.");
  if (input.content.length > 1_000_000) throw new Error("Dropbox upload content exceeds the 1 MB safety limit.");
  if (input.mode === "update" && !input.rev) throw new Error("Dropbox replacement requires the current revision to prevent a silent overwrite.");
  const mode = input.mode === "update" ? { ".tag": "update", update: input.rev } : { ".tag": "add" };
  const response = await fetcher(`${contentBase(env)}/2/files/upload`, { method: "POST", headers: headers(env, { "content-type": "application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ path: input.path, mode, autorename: false, mute: false }) }, "write"), body: input.content });
  if (!response.ok) throw apiError(response.status);
  return mapEntry(UploadSchema.parse(await response.json()));
}
