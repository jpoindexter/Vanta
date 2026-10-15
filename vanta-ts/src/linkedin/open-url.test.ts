import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "./open-url.js";

function spawnFixture() {
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = vi.fn();
  const spawn = vi.fn(() => child);
  return { child, spawn };
}

describe("LinkedIn browser launch", () => {
  it("passes the full OAuth URL as one macOS argv value without a shell", async () => {
    const fixture = spawnFixture();
    const url = "https://www.linkedin.com/oauth/native-pkce/authorization?state=a&scope=b";
    const opened = openExternalUrl(url, "darwin", fixture.spawn as never);
    fixture.child.emit("spawn");
    await opened;
    expect(fixture.spawn).toHaveBeenCalledWith("open", [url], expect.objectContaining({
      stdio: "ignore",
      detached: true,
    }));
  });

  it("uses rundll32 directly on Windows instead of command-shell parsing", async () => {
    const fixture = spawnFixture();
    const url = "https://www.linkedin.com/oauth/native-pkce/authorization?state=a&scope=b";
    const opened = openExternalUrl(url, "win32", fixture.spawn as never);
    fixture.child.emit("spawn");
    await opened;
    expect(fixture.spawn).toHaveBeenCalledWith(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", url],
      expect.any(Object),
    );
  });
});
