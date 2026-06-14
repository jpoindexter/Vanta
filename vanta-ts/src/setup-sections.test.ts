import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./setup.js", () => ({ askLine: vi.fn(async () => ""), askSecret: vi.fn(async () => ""), setEnv: vi.fn(async () => {}) }));
vi.mock("./term/select.js", () => ({ select: vi.fn(async () => 0) }));

import { runSettingSection, SETTINGS } from "./setup-sections.js";
import { askLine, askSecret, setEnv } from "./setup.js";
import { select } from "./term/select.js";

const mSelect = vi.mocked(select);
const mSet = vi.mocked(setEnv);
const mAskSecret = vi.mocked(askSecret);
const mAskLine = vi.mocked(askLine);

const byKey = (k: string) => SETTINGS.find((s) => s.key === k);
const vision = byKey("VANTA_VISION_MODEL")!;
const search = byKey("VANTA_SEARCH_PROVIDER")!;

beforeEach(() => vi.clearAllMocks());

describe("SETTINGS catalog", () => {
  it("covers Vanta's non-trash knobs; no Nous/Spotify/TTS", () => {
    expect(SETTINGS.map((s) => s.key)).toEqual([
      "VANTA_VISION_MODEL", "VANTA_SEARCH_PROVIDER", "VANTA_MAX_ITER", "VANTA_MEMORY_MAX_BLOCKS", "VANTA_THEME", "VANTA_SPINNER",
    ]);
    const blob = JSON.stringify(SETTINGS).toLowerCase();
    expect(blob).not.toContain("nous");
    expect(blob).not.toContain("spotify");
    expect(blob).not.toContain("text-to-speech");
  });
});

describe("runSettingSection", () => {
  it("Esc (−1) writes nothing", async () => {
    mSelect.mockResolvedValue(-1);
    await runSettingSection("/repo", vision);
    expect(mSet).not.toHaveBeenCalled();
  });

  it("a 'keep current' choice (undefined value) writes nothing", async () => {
    mSelect.mockResolvedValue(0); // vision[0] = keep current
    await runSettingSection("/repo", vision);
    expect(mSet).not.toHaveBeenCalled();
  });

  it("a value choice writes that env var", async () => {
    mSelect.mockResolvedValue(1); // vision[1] = gpt-4o-mini
    await runSettingSection("/repo", vision);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_VISION_MODEL: "gpt-4o-mini" });
  });

  it("a key-requiring choice collects the secret too", async () => {
    mSelect.mockResolvedValue(2); // search[2] = serpapi (keyEnv SERPAPI_KEY)
    mAskSecret.mockResolvedValue("sk-serp");
    await runSettingSection("/repo", search);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_SEARCH_PROVIDER: "serpapi", SERPAPI_KEY: "sk-serp" });
  });

  it("the custom option writes a typed value", async () => {
    mSelect.mockResolvedValue(4); // vision: 4 choices + custom → custom index = 4
    mAskLine.mockResolvedValue("my-vision-model");
    await runSettingSection("/repo", vision);
    expect(mSet).toHaveBeenCalledWith("/repo", { VANTA_VISION_MODEL: "my-vision-model" });
  });
});
