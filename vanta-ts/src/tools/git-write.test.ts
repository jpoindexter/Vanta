import { describe, expect, it } from "vitest";
import { gitPushTool } from "./git-write.js";

// describeForSafety is what the kernel assesses. A constant "git push" would
// hide --force, downgrading a destructive force-push from Block to Ask. These
// tests pin the flag (and remote/branch) into the assessed string.
describe("gitPushTool.describeForSafety", () => {
  const describe_ = gitPushTool.describeForSafety!;

  it("includes --force when force is set (so the kernel's DATA_LOSS net fires)", () => {
    const desc = describe_({ remote: "origin", branch: "main", force: true });
    expect(desc).toContain("--force");
    expect(desc).toContain("git push");
    expect(desc).toContain("origin");
    expect(desc).toContain("main");
  });

  it("omits --force on a normal push", () => {
    const desc = describe_({ remote: "origin", branch: "main" });
    expect(desc).not.toContain("--force");
    expect(desc).toBe("git push origin main");
  });

  it("trims to bare 'git push' with no args", () => {
    expect(describe_({})).toBe("git push");
  });
});
