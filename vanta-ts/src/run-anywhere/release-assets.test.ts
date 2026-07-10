import { describe, expect, it } from "vitest";
import { fetchAndroidReleaseAssetStatus, formatReleaseAssetStatus, inspectAndroidReleaseAssets } from "./release-assets.js";

describe("Run Anywhere release asset check", () => {
  it("requires the Android/Bionic kernel and checksum assets", () => {
    const status = inspectAndroidReleaseAssets({
      tag_name: "v0.8.0",
      assets: [
        { name: "vanta-kernel-aarch64-apple-darwin" },
        { name: "vanta-kernel-aarch64-linux-android" },
      ],
    });
    expect(status).toMatchObject({ ok: false, tagName: "v0.8.0" });
    expect(status.missing).toEqual(["vanta-kernel-aarch64-linux-android.sha256"]);
    expect(formatReleaseAssetStatus(status)).toContain("publish a release");
  });

  it("passes when both Android release assets exist", () => {
    const status = inspectAndroidReleaseAssets({
      tagName: "v0.9.0",
      assets: [
        { name: "vanta-kernel-aarch64-linux-android" },
        { name: "vanta-kernel-aarch64-linux-android.sha256" },
      ],
    });
    expect(status).toMatchObject({ ok: true, tagName: "v0.9.0", missing: [] });
  });

  it("fetches latest release metadata through an injected fetch", async () => {
    const status = await fetchAndroidReleaseAssetStatus({
      repo: "owner/repo",
      fetch: async (url) => {
        expect(String(url)).toBe("https://api.github.com/repos/owner/repo/releases/latest");
        return new Response(JSON.stringify({ tag_name: "v1", assets: [] }), { status: 200 });
      },
    });
    expect(status).toMatchObject({ ok: false, missing: expect.arrayContaining(["vanta-kernel-aarch64-linux-android"]) });
  });
});
