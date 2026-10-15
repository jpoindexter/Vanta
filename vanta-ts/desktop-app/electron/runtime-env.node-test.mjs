import assert from "node:assert/strict";
import test from "node:test";
import { desktopRuntimeEnv } from "./runtime-env.mjs";

test("packaged macOS runtime can find Homebrew and user-local MCP executables", () => {
  const env = desktopRuntimeEnv(
    { PATH: "/usr/bin:/bin", HOME: "/Users/jane", KEEP_ME: "yes" },
    { platform: "darwin", home: "/Users/jane" },
  );
  const path = env.PATH.split(":");

  assert.equal(path[0], "/Users/jane/.local/bin");
  assert.ok(path.includes("/opt/homebrew/bin"));
  assert.ok(path.includes("/usr/local/bin"));
  assert.ok(path.includes("/usr/bin"));
  assert.equal(new Set(path).size, path.length);
  assert.equal(env.KEEP_ME, "yes");
});

test("non-macOS runtime preserves the caller PATH", () => {
  const env = desktopRuntimeEnv({ PATH: "/custom/bin:/usr/bin" }, { platform: "linux", home: "/home/jane" });
  assert.equal(env.PATH, "/custom/bin:/usr/bin");
});
