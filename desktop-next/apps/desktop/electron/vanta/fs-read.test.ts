import { mkdirSync, truncateSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DATA_URL_MAX_BYTES, gitRoot, readDir, readFileDataUrl, readFileText, TEXT_PREVIEW_MAX_BYTES } from "./fs-read";
import { normalizePreviewTarget } from "./fs-preview";
import { link, makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;

afterEach(() => box?.cleanup());

function seed(): void {
  box = makeSandbox();
  write(path.join(box.root, "src", "index.ts"), "export const a = 1;\n");
  write(path.join(box.root, "README.md"), "# hi\n");
  write(path.join(box.root, ".env"), "KEY=secret\n");
  write(path.join(box.root, ".gitignore"), "dist\n");
  mkdirSync(path.join(box.root, "node_modules", "x"), { recursive: true });
  mkdirSync(path.join(box.root, ".git"));
}

describe("readDir", () => {
  it("lists folders first, then files by name, and hides noise and secrets", async () => {
    seed();

    const result = await readDir(box.guard, box.root);

    expect(result.entries.map(entry => entry.name)).toEqual(["src", ".gitignore", "README.md"]);
    expect(result.entries[0]).toMatchObject({ isDirectory: true, path: path.join(box.root, "src") });
    expect(result.total).toBe(3);
    expect(result.truncated).toBeUndefined();
  });

  it("pages a big folder and says there is more", async () => {
    box = makeSandbox();

    for (let index = 0; index < 12; index += 1) {
      write(path.join(box.root, `f${String(index).padStart(2, "0")}.txt`), "x");
    }

    const first = await readDir(box.guard, box.root, { limit: 5 });
    const second = await readDir(box.guard, box.root, { limit: 5, offset: 10 });

    expect(first.entries.map(entry => entry.name)).toEqual(["f00.txt", "f01.txt", "f02.txt", "f03.txt", "f04.txt"]);
    expect(first).toMatchObject({ total: 12, truncated: true });
    expect(second.entries.map(entry => entry.name)).toEqual(["f10.txt", "f11.txt"]);
    expect(second.truncated).toBeUndefined();
  });

  it("ignores a malformed page request instead of failing", async () => {
    seed();

    const result = await readDir(box.guard, box.root, { limit: -4, nonsense: true });

    expect(result.entries.length).toBe(3);
  });

  it("omits a symlink that points outside the project and keeps one that stays inside", async () => {
    seed();
    link(box.outside, path.join(box.root, "escape"));
    link(path.join(box.root, "src"), path.join(box.root, "shortcut"));

    const names = (await readDir(box.guard, box.root)).entries.map(entry => entry.name);

    expect(names).toContain("shortcut");
    expect(names).not.toContain("escape");
  });

  it.each([
    ["a folder outside the project", () => box.outside, "outside-project"],
    ["a .. path", () => `${box.root}/..`, "outside-project"],
    ["a secret folder", () => path.join(box.root, ".git"), "denied"],
    ["a missing folder", () => path.join(box.root, "nope"), "ENOENT"],
    ["a file", () => path.join(box.root, "README.md"), "ENOTDIR"]
  ])("refuses %s with an error code and no entries", async (_label, make, error) => {
    seed();

    expect(await readDir(box.guard, make())).toEqual({ entries: [], error });
  });
});

describe("gitRoot", () => {
  it("finds the repository root from a nested folder, in the spelling it was asked in", async () => {
    seed();

    expect(await gitRoot(box.guard, path.join(box.root, "src"))).toBe(box.root);
  });

  it("finds a nested repository before the project's own", async () => {
    seed();
    mkdirSync(path.join(box.root, "pkg", ".git"), { recursive: true });
    write(path.join(box.root, "pkg", "lib", "x.ts"), "x");

    expect(await gitRoot(box.guard, path.join(box.root, "pkg", "lib", "x.ts"))).toBe(path.join(box.root, "pkg"));
  });

  it("answers null when no repository sits inside the project, and never climbs above it", async () => {
    box = makeSandbox();
    mkdirSync(path.join(path.dirname(box.root), ".git"));

    expect(await gitRoot(box.guard, box.root)).toBeNull();
  });

  it("answers null for a path outside the project", async () => {
    seed();

    expect(await gitRoot(box.guard, box.outside)).toBeNull();
  });
});

describe("readFileText", () => {
  it("reads a project file with its language and size", async () => {
    seed();

    expect(await readFileText(box.guard, path.join(box.root, "src", "index.ts"))).toMatchObject({
      binary: false,
      byteSize: 20,
      language: "typescript",
      path: path.join(box.root, "src", "index.ts"),
      text: "export const a = 1;\n",
      truncated: false
    });
  });

  it("truncates a large file at the preview cap and says so", async () => {
    seed();
    write(path.join(box.root, "big.txt"), "a".repeat(TEXT_PREVIEW_MAX_BYTES + 10));

    const result = await readFileText(box.guard, path.join(box.root, "big.txt"));

    expect(result).toMatchObject({ byteSize: TEXT_PREVIEW_MAX_BYTES + 10, truncated: true });
    expect("text" in result && result.text.length).toBe(TEXT_PREVIEW_MAX_BYTES);
  });

  it("returns no text for a binary file", async () => {
    seed();
    write(path.join(box.root, "blob.bin"), "ab\0cd");

    expect(await readFileText(box.guard, path.join(box.root, "blob.bin"))).toMatchObject({ binary: true, text: "" });
  });

  it.each([
    ["a secret file", () => path.join(box.root, ".env"), "denied"],
    ["a file outside the project", () => path.join(box.outside, "secret.txt"), "outside-project"],
    ["a missing file", () => path.join(box.root, "gone.txt"), "ENOENT"],
    ["a folder", () => box.root, "EISDIR"]
  ])("refuses %s with a readable message and no text", async (_label, make, error) => {
    seed();

    const result = await readFileText(box.guard, make());

    expect(result).toMatchObject({ error, ok: false });
    expect(JSON.stringify(result)).not.toContain("KEY=secret");
    expect(JSON.stringify(result)).not.toContain("outside-data");
  });
});

describe("readFileDataUrl", () => {
  it("returns an image as a data URL with its media type", async () => {
    seed();
    write(path.join(box.root, "pic.png"), "PNGDATA");

    expect(await readFileDataUrl(box.guard, path.join(box.root, "pic.png"))).toBe(`data:image/png;base64,${Buffer.from("PNGDATA").toString("base64")}`);
  });

  it("refuses a file over the size cap without reading it", async () => {
    seed();
    const big = write(path.join(box.root, "huge.png"), "x");
    truncateSync(big, DATA_URL_MAX_BYTES + 1);

    expect(await readFileDataUrl(box.guard, big)).toMatchObject({ error: "EFBIG", ok: false });
  });

  it("refuses a secret file and an outside file", async () => {
    seed();

    expect(await readFileDataUrl(box.guard, path.join(box.root, ".env"))).toMatchObject({ error: "denied", ok: false });
    expect(await readFileDataUrl(box.guard, path.join(box.outside, "secret.txt"))).toMatchObject({ error: "outside-project", ok: false });
  });
});

describe("normalizePreviewTarget", () => {
  it("describes a text file in the project, resolving a relative link against the base folder", async () => {
    seed();

    const target = await normalizePreviewTarget(box.guard, "index.ts", path.join(box.root, "src"));

    expect(target).toMatchObject({ kind: "file", label: "index.ts", language: "typescript", previewKind: "text" });
  });

  it("classifies html, images, binaries and folders", async () => {
    seed();
    write(path.join(box.root, "p.html"), "<p>");
    write(path.join(box.root, "p.png"), "x");
    write(path.join(box.root, "b.bin"), "a\0b");

    const kinds = await Promise.all(["p.html", "p.png", "b.bin", "src"].map(name => normalizePreviewTarget(box.guard, path.join(box.root, name), "")));

    expect(kinds.map(target => target && "previewKind" in target && target.previewKind)).toEqual(["html", "image", "binary", "directory"]);
  });

  it("reports a dead link inside the project as missing", async () => {
    seed();

    expect(await normalizePreviewTarget(box.guard, path.join(box.root, "gone.md"), "")).toMatchObject({ previewKind: "missing" });
  });

  it("passes an http link through", async () => {
    seed();

    expect(await normalizePreviewTarget(box.guard, "http://localhost:3000/x", "")).toMatchObject({ kind: "url", url: "http://localhost:3000/x" });
  });

  it.each([
    ["a file outside the project", () => path.join(box.outside, "secret.txt")],
    ["a .. escape", () => "../outside/secret.txt"],
    ["a secret file", () => path.join(box.root, ".env")],
    ["javascript:", () => "javascript:alert(1)"],
    ["an empty target", () => "  "]
  ])("returns null for %s", async (_label, make) => {
    seed();

    expect(await normalizePreviewTarget(box.guard, make(), "")).toBeNull();
  });
});
