import { afterEach, describe, expect, it, vi } from "vitest";
import { markLaunch } from "./launch-trace.js";

describe("markLaunch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints the stage with elapsed ms when VANTA_LAUNCH_TRACE=1", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    markLaunch("listening", { VANTA_LAUNCH_TRACE: "1" });
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/^\[launch\] listening \+\d+ms\n$/));
  });

  it("is silent by default", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    markLaunch("listening", {});
    expect(write).not.toHaveBeenCalled();
  });
});
