import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCookie } from "../cookie.js";
import { linkedinChannel } from "./linkedin.js";

let home: string;
let previous: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-linkedin-channel-"));
  previous = process.env.VANTA_HOME;
  process.env.VANTA_HOME = home;
});

afterEach(() => {
  if (previous === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = previous;
  rmSync(home, { recursive: true, force: true });
});

describe("linkedin reach channel", () => {
  it("does not mark an incomplete cookie set authenticated", async () => {
    expect(saveCookie("linkedin", "JSESSIONID=ajax:1; bcookie=id").ok).toBe(true);
    await expect(linkedinChannel.check(process.env)).resolves.toMatchObject({
      status: "warn",
      detail: expect.stringContaining("not authenticated"),
    });
  });

  it("recognizes a stored session containing li_at", async () => {
    expect(saveCookie("linkedin", "li_at=auth; JSESSIONID=ajax:1").ok).toBe(true);
    await expect(linkedinChannel.check(process.env)).resolves.toMatchObject({
      status: "ok",
      detail: "session credential present; acceptance is verified on use",
    });
  });
});
