import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveDroppedPaths } from "./dropped-paths.mjs";

test("expands folders and returns project-relative and external paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-drop-root-"));
  const external = await mkdtemp(join(tmpdir(), "vanta-drop-external-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "a.md"), "a");
    await writeFile(join(root, "docs", ".env"), "secret");
    await writeFile(join(external, "outside.pdf"), "pdf");
    await symlink(join(external, "outside.pdf"), join(root, "docs", "linked.pdf"));

    const result = await resolveDroppedPaths(
      [join(root, "docs"), join(external, "outside.pdf")],
      root,
    );

    assert.deepEqual(result.files, ["docs/a.md", join(external, "outside.pdf")]);
    assert.deepEqual(result.items, [
      {
        id: "folder:docs",
        kind: "folder",
        path: "docs",
        label: "docs",
        files: ["docs/a.md"],
      },
      {
        id: `file:${join(external, "outside.pdf")}`,
        kind: "file",
        path: join(external, "outside.pdf"),
        label: "outside.pdf",
        files: [join(external, "outside.pdf")],
      },
    ]);
    assert.match(result.errors.join(" "), /2 unsafe, private, or unsupported items were skipped/);
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(external, { recursive: true, force: true }),
    ]);
  }
});

test("caps large folder drops and reports unavailable paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "vanta-drop-cap-"));
  try {
    await mkdir(join(root, "many"));
    await Promise.all(Array.from({ length: 5 }, (_, index) => writeFile(join(root, "many", `${index}.txt`), String(index))));
    const result = await resolveDroppedPaths([join(root, "many"), join(root, "missing")], root, 3);
    assert.deepEqual(result.files, ["many/0.txt", "many/1.txt", "many/2.txt"]);
    assert.deepEqual(result.items, [{
      id: "folder:many",
      kind: "folder",
      path: "many",
      label: "many",
      files: ["many/0.txt", "many/1.txt", "many/2.txt"],
    }]);
    assert.match(result.errors.join(" "), /Only the first 3 files were attached/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
