import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { companionUrls, isLoopbackRequest } from "./routes.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "vanta-companion-routes-")); });
afterEach(async () => rm(home, { recursive: true, force: true }));

describe("companion route boundaries", () => {
  it("recognizes IPv4 and IPv6 loopback clients", () => {
    for (const remoteAddress of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(isLoopbackRequest({ socket: { remoteAddress } } as any)).toBe(true);
    }
    expect(isLoopbackRequest({ socket: { remoteAddress: "192.168.1.8" } } as any)).toBe(false);
  });

  it("advertises distinct noninternal IPv4 URLs", () => {
    const urls = companionUrls(7790, { en0: [{ address: "192.168.1.4", family: "IPv4", internal: false } as any], lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true } as any] });
    expect(urls).toEqual(["http://192.168.1.4:7790/companion"]);
  });
});
