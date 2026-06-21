import { describe, it, expect } from "vitest";
import { Text } from "ink";
import type { ReactElement } from "react";
import { renderUi, waitForFrame } from "./test-render.js";
import { useSlackChannels, type ChannelLoader } from "./use-slack-channels.js";
import type { SlackChannel } from "../repl/slack-suggest.js";

function Probe({ loader }: { loader?: ChannelLoader }): ReactElement {
  // empty env → no VANTA_SLACK_TOKEN, so the real path is inert
  const ch = useSlackChannels(loader, {} as NodeJS.ProcessEnv);
  return <Text>chans:[{ch.map((c) => c.name).join(",")}]</Text>;
}

describe("useSlackChannels", () => {
  it("no token + no loader → stays empty (inert, never fetches)", async () => {
    const inst = renderUi(<Probe />);
    const frame = await waitForFrame(inst, "chans:");
    expect(frame).toContain("chans:[]");
  });

  it("with an injected loader → surfaces the channels after the async load", async () => {
    const loader: ChannelLoader = async () => [
      { id: "C1", name: "general" } as SlackChannel,
      { id: "C2", name: "random" } as SlackChannel,
    ];
    const inst = renderUi(<Probe loader={loader} />);
    const frame = await waitForFrame(inst, "general");
    expect(frame).toContain("general");
    expect(frame).toContain("random");
  });
});
