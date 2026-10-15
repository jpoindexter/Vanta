import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadDropbox, isSafeDropboxPath, listDropbox, searchDropbox, uploadDropbox } from "./dropbox.js";
import { dropboxWriteTool } from "../tools/dropbox-write.js";
import type { ToolContext } from "../tools/types.js";

const env = { VANTA_DROPBOX_TOKEN: "token", VANTA_DROPBOX_WRITE_TOKEN: "write-token", VANTA_DROPBOX_API_BASE: "https://api.dropbox.test", VANTA_DROPBOX_CONTENT_BASE: "https://content.dropbox.test" };
const entry = { ".tag": "file", id: "id:file", name: "notes.txt", path_display: "/notes.txt", rev: "rev-1" };
const json = (value: unknown, status = 200) => ({ ok: status < 300, status, json: async () => value, headers: new Headers(), text: async () => String(value) }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe("Dropbox contract", () => {
  it("lists and searches only safe paths", async () => {
    const fetcher = vi.fn(async (_url: string) => json({ entries: [entry], cursor: "cursor", has_more: false }));
    await expect(listDropbox("/work", env, fetcher as unknown as typeof fetch)).resolves.toMatchObject({ entries: [{ pathDisplay: "/notes.txt" }] });
    await expect(searchDropbox("notes", "/work", env, vi.fn(async () => json({ matches: [{ metadata: { metadata: entry } }] })) as unknown as typeof fetch)).resolves.toMatchObject([{ name: "notes.txt" }]);
    expect(isSafeDropboxPath("/work/../secret")).toBe(false);
    await expect(listDropbox("../secret", env, fetcher as unknown as typeof fetch)).rejects.toThrow("absolute");
  });

  it("bounds text attachments and requires a revision to replace a file", async () => {
    const download = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ "dropbox-api-result": JSON.stringify(entry) }), text: async () => "hello" }));
    await expect(downloadDropbox("/notes.txt", env, download as unknown as typeof fetch)).resolves.toEqual({ content: "hello", rev: "rev-1" });
    await expect(uploadDropbox({ path: "/notes.txt", content: "next", mode: "update" }, env, download as unknown as typeof fetch)).rejects.toThrow("revision");
    const upload = vi.fn(async () => json(entry));
    await expect(uploadDropbox({ path: "/notes.txt", content: "next", mode: "update", rev: "rev-1" }, env, upload as unknown as typeof fetch)).resolves.toMatchObject({ rev: "rev-1" });
    await expect(uploadDropbox({ path: "/notes.txt", content: "next", mode: "add" }, { ...env, VANTA_DROPBOX_WRITE_TOKEN: "" }, upload as unknown as typeof fetch)).rejects.toThrow("WRITE_TOKEN");
    await expect(listDropbox("/", env, vi.fn(async () => json({}, 429)) as unknown as typeof fetch)).rejects.toThrow("rate limit");
  });
});

describe("Dropbox tools", () => {
  it("does not write when an operator rejects the action", async () => {
    const result = await dropboxWriteTool.execute({ path: "/notes.txt", content: "next" }, { root: "/tmp/vanta-dropbox", requestApproval: async () => false } as unknown as ToolContext);
    expect(result).toEqual({ ok: false, output: "denied by user" });
  });
});
