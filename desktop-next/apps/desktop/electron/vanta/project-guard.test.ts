import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { link, makeSandbox, type Sandbox, write } from "./project-test-helpers";
import { createProjectGuard, isSecretPath } from "./project-guard";

let box: Sandbox;

afterEach(() => box?.cleanup());

describe("project guard", () => {
  it("resolves a file inside the project to its real path and a POSIX-relative name", async () => {
    box = makeSandbox();
    write(path.join(box.root, "src", "a.ts"), "x");

    const found = await box.guard.resolve(path.join(box.root, "src", "a.ts"), "file");

    expect(found).toMatchObject({ ok: true, value: { isDirectory: false, rel: "src/a.ts" } });
  });

  it("resolves a project-relative name against the root", async () => {
    box = makeSandbox();
    write(path.join(box.root, "b.md"), "x");

    expect(await box.guard.resolve("b.md", "file")).toMatchObject({ ok: true, value: { rel: "b.md" } });
  });

  it.each([
    ["a .. segment", () => `${box.root}/../outside/secret.txt`, "outside"],
    ["a relative .. escape", () => "../outside/secret.txt", "outside"],
    ["an absolute path outside the project", () => path.join(box.outside, "secret.txt"), "outside"],
    ["an empty string", () => "", "invalid"],
    ["a NUL byte", () => `${box.root}/a\0b`, "invalid"],
    ["a missing file", () => path.join(box.root, "nope.txt"), "missing"]
  ])("refuses %s", async (_label, make, code) => {
    box = makeSandbox();

    expect(await box.guard.resolve(make())).toMatchObject({ error: { code }, ok: false });
  });

  it("refuses a non-string path", async () => {
    box = makeSandbox();

    expect(await box.guard.resolve(42)).toMatchObject({ error: { code: "invalid" }, ok: false });
  });

  it("refuses a symlink inside the project that points outside it", async () => {
    box = makeSandbox();
    link(box.outside, path.join(box.root, "escape"));

    expect(await box.guard.resolve(path.join(box.root, "escape", "secret.txt"))).toMatchObject({
      error: { code: "outside" },
      ok: false
    });
    expect(await box.guard.resolve(path.join(box.root, "escape"), "dir")).toMatchObject({ error: { code: "outside" } });
  });

  it("allows a symlink that stays inside the project", async () => {
    box = makeSandbox();
    write(path.join(box.root, "real", "f.txt"), "x");
    link(path.join(box.root, "real"), path.join(box.root, "alias"));

    expect(await box.guard.resolve(path.join(box.root, "alias", "f.txt"), "file")).toMatchObject({
      ok: true,
      value: { rel: "real/f.txt" }
    });
  });

  it("refuses a symlink with an innocent name that points at a secret file", async () => {
    box = makeSandbox();
    write(path.join(box.root, ".env"), "KEY=1");
    link(path.join(box.root, ".env"), path.join(box.root, "notes.txt"));

    expect(await box.guard.resolve(path.join(box.root, "notes.txt"))).toMatchObject({ error: { code: "denied" } });
  });

  it.each([".env", ".env.local", "id_rsa", "server.pem", "aws-credentials.json", ".npmrc", "config/.ssh/known_hosts", ".git/config", ".vanta/auth.json"])(
    "refuses the secret path %s",
    async rel => {
      box = makeSandbox();
      write(path.join(box.root, rel), "secret");

      expect(await box.guard.resolve(rel)).toMatchObject({ error: { code: "denied" }, ok: false });
    }
  );

  it("refuses anything under a denied root such as VANTA_HOME", async () => {
    box = makeSandbox();
    const denied = path.join(box.root, "state");
    write(path.join(denied, "notes.txt"), "x");
    const guarded = createProjectGuard({ deniedRoots: () => [denied], root: () => box.root });

    expect(await guarded.resolve(path.join(denied, "notes.txt"))).toMatchObject({ error: { code: "denied" } });
  });

  it("enforces the requested kind", async () => {
    box = makeSandbox();
    write(path.join(box.root, "f.txt"), "x");

    expect(await box.guard.resolve("f.txt", "dir")).toMatchObject({ error: { code: "not-dir" } });
    expect(await box.guard.resolve(".", "file")).toMatchObject({ error: { code: "not-file" } });
  });

  it("answers missing when the project folder itself is gone", async () => {
    box = makeSandbox();
    const gone = createProjectGuard({ root: () => path.join(box.root, "deleted") });

    expect(await gone.resolve("a.txt")).toMatchObject({ error: { code: "missing" } });
  });
});

describe("isSecretPath", () => {
  it.each([".env", "a/.env.production", "x/.aws/credentials", ".git/HEAD", "k/id_ed25519", "t/prod.tfstate"])("flags %s", rel => {
    expect(isSecretPath(rel)).toBe(true);
  });

  it.each(["src/index.ts", "README.md", "environment.ts", "docs/secretary.md", "keys.ts"])("allows %s", rel => {
    expect(isSecretPath(rel)).toBe(false);
  });
});
