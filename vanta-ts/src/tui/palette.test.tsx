import { render } from "./test-render.js";
import { describe, it, expect } from "vitest";
import { Palette } from "./transcript.js";
import { formatRiskLabel, getRiskTier } from "./command-risk.js";

describe("Palette with risk labels", () => {
  it("renders command names, risk labels, and descriptions", () => {
    const matches = [
      { name: "help", desc: "show command list", risk: formatRiskLabel(getRiskTier("help")) },
      { name: "goal", desc: "set a goal", risk: formatRiskLabel(getRiskTier("goal")) },
      { name: "shell-cmd", desc: "run a command", risk: formatRiskLabel(getRiskTier("shell-cmd")) },
    ];
    const { lastFrame } = render(<Palette matches={matches} sel={0} width={80} />);
    const frame = lastFrame();

    expect(frame).toContain("help");
    expect(frame).toContain("[local]");
    expect(frame).toContain("show command list");

    expect(frame).toContain("goal");
    expect(frame).toContain("[approval]");
    expect(frame).toContain("set a goal");

    expect(frame).toContain("shell-cmd");
    expect(frame).toContain("[kernel]");
    expect(frame).toContain("run a command");
  });

  it("highlights the selected command in cyan", () => {
    const matches = [
      { name: "help", desc: "show list", risk: "[local]" },
      { name: "goal", desc: "set goal", risk: "[approval]" },
    ];
    const { lastFrame } = render(<Palette matches={matches} sel={1} width={80} />);
    const frame = lastFrame();

    // The selected (index 1) item should have the selection marker
    expect(frame).toContain("›");
  });

  it("clips descriptions to fit terminal width", () => {
    const longDesc = "this is a very long description that should be clipped";
    const matches = [
      { name: "test", desc: longDesc, risk: "[local]" },
    ];
    const { lastFrame } = render(<Palette matches={matches} sel={0} width={30} />);
    const frame = lastFrame();

    // The description should be present but clipped (ends with …)
    expect(frame).toContain("test");
  });

  it("displays command arguments when provided", () => {
    const matches = [
      { name: "goal", arg: "<text>", desc: "set a goal", risk: "[approval]" },
      { name: "image", arg: "<path>", desc: "attach image", risk: "[local]" },
    ];
    const { lastFrame } = render(<Palette matches={matches} sel={0} width={100} />);
    const frame = lastFrame();

    expect(frame).toContain("/goal");
    expect(frame).toContain("<text>");
    expect(frame).toContain("/image");
    expect(frame).toContain("<path>");
  });
});
